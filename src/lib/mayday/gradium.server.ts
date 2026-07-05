// Gradium voice API (docs.gradium.ai) — REST TTS + STT.
//
// Env:
//   GRADIUM_API_KEY    required to enable Gradium voices
//   GRADIUM_VOICE_ID   optional, default Emma (en) "YTpq7expH9539ERJ"
//                      other EN: Kent LFZvm12tW_z0xfGo, John KWJiFWu2O9nMPYcR
//   GRADIUM_API_BASE   optional, default https://api.gradium.ai (mockable in tests)

const DEFAULT_VOICE_EN = "YTpq7expH9539ERJ"; // Emma — English catalog voice

export function gradiumApiBase() {
  return (process.env.GRADIUM_API_BASE || "https://api.gradium.ai").replace(/\/$/, "");
}

export function gradiumConfigured() {
  return !!process.env.GRADIUM_API_KEY;
}

export function gradiumVoiceId() {
  return process.env.GRADIUM_VOICE_ID || DEFAULT_VOICE_EN;
}

// Text → WAV bytes (48kHz 16-bit mono). Twilio <Play> accepts WAV over HTTPS.
export async function gradiumTts(
  text: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const key = process.env.GRADIUM_API_KEY;
  if (!key) throw new Error("GRADIUM_API_KEY not set");
  const res = await fetch(`${gradiumApiBase()}/api/post/speech/tts`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice_id: gradiumVoiceId(),
      output_format: "wav",
      only_audio: true,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gradium TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: res.headers.get("content-type") || "audio/wav" };
}

// Audio bytes → transcript. Response is NDJSON: {"type":"text","text":...} segments.
export async function gradiumStt(
  audio: ArrayBuffer,
  contentType = "audio/wav",
  language = "en",
): Promise<string> {
  const key = process.env.GRADIUM_API_KEY;
  if (!key) throw new Error("GRADIUM_API_KEY not set");
  const cfg = encodeURIComponent(JSON.stringify({ language }));
  const res = await fetch(`${gradiumApiBase()}/api/post/speech/asr?json_config=${cfg}`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": contentType },
    body: audio,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gradium STT ${res.status}: ${detail.slice(0, 200)}`);
  }
  const raw = await res.text();
  const parts: string[] = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      const j = JSON.parse(l) as { type?: string; text?: string; message?: string };
      if (j.type === "text" && j.text) parts.push(j.text);
      if (j.type === "error") throw new Error(`Gradium STT error: ${j.message}`);
    } catch (e) {
      if ((e as Error).message?.startsWith("Gradium STT error")) throw e;
      /* non-JSON line — ignore */
    }
  }
  return parts.join(" ").trim();
}

// HMAC signature so the public TTS route can't be abused to spend credits:
// the URL is minted server-side with the API key as the HMAC secret.
export async function signText(text: string): Promise<string> {
  const key = process.env.GRADIUM_API_KEY || "";
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(text));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function verifyText(text: string, sig: string): Promise<boolean> {
  return (await signText(text)) === sig;
}

// Build a public, signed TTS URL for TwiML <Play>.
export async function ttsUrl(origin: string, text: string): Promise<string> {
  const sig = await signText(text);
  return `${origin}/api/public/mayday/tts?sig=${sig}&text=${encodeURIComponent(text)}`;
}
