import { createFileRoute } from "@tanstack/react-router";
import { gradiumStt, ttsUrl } from "@/lib/mayday/gradium.server";
import { twilioBasicAuth, twilioCreds } from "@/lib/mayday/twilio.server";
import {
  CONFIRM_EN,
  DEFAULT_WAIT_EN,
  REASK_EN,
  normalizeReply,
  recordDecision,
} from "@/lib/mayday/voice.server";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

async function playOrSay(origin: string, text: string) {
  // Prefer the Gradium voice; if TTS URL minting fails, Polly keeps the call alive.
  try {
    return `<Play>${xmlEscape(await ttsUrl(origin, text))}</Play>`;
  } catch {
    return `<Say voice="Polly.Joanna-Neural" language="en-US">${xmlEscape(text)}</Say>`;
  }
}

// Download the caller's recording from Twilio (WAV). Recordings can lag a
// moment behind the callback, so retry briefly.
async function fetchRecording(recordingUrl: string): Promise<ArrayBuffer> {
  const creds = twilioCreds();
  const auth = creds ? twilioBasicAuth(creds) : null;
  const url = `${recordingUrl}.wav`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: auth ? { Authorization: auth } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return await res.arrayBuffer();
    lastErr = `${res.status}`;
    if (res.status !== 404) break;
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error(`recording fetch failed (${lastErr})`);
}

// Twilio <Record action> callback: transcribe the reply with Gradium STT,
// normalize it, persist the decision, answer with the Gradium voice.
export const Route = createFileRoute("/api/public/mayday/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const id = url.searchParams.get("id") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const attempt = Number(url.searchParams.get("n") ?? "1");
        const form = await request.formData();
        const digits = String(form.get("Digits") ?? "");
        const recordingUrl = String(form.get("RecordingUrl") ?? "");
        const durationS = Number(form.get("RecordingDuration") ?? "0");

        let transcript = "";
        // A digit pressed during recording (finishOnKey) decides immediately.
        if (!normalizeReply(digits, "") && recordingUrl && durationS > 0) {
          try {
            const audio = await fetchRecording(recordingUrl);
            transcript = await gradiumStt(audio, "audio/wav", "en");
          } catch {
            transcript = ""; // STT down → treated as unclear
          }
        }

        const decision = normalizeReply(digits, transcript);

        if (decision) {
          await recordDecision(id, decision, state);
          return twiml(await playOrSay(origin, CONFIRM_EN[decision]));
        }

        if (attempt < 2) {
          const cb = `${origin}/api/public/mayday/recording?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}&n=2`;
          return twiml(
            `${await playOrSay(origin, REASK_EN)}<Record action="${xmlEscape(cb)}" method="POST" maxLength="7" timeout="4" playBeep="true" trim="trim-silence" finishOnKey="123"/>${await playOrSay(origin, DEFAULT_WAIT_EN)}`,
          );
        }

        await recordDecision(id, "wait", state);
        return twiml(await playOrSay(origin, DEFAULT_WAIT_EN));
      },
    },
  },
});
