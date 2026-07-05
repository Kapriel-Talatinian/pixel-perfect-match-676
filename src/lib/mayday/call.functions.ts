import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { IncidentDecision } from "./store.server";
import { gradiumConfigured, gradiumVoiceId, ttsUrl } from "./gradium.server";
import { discoverNumbers, twilioBasicAuth, twilioCreds } from "./twilio.server";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// English spoken brief for the actual phone call (matches the on-screen brief).
export const PHONE_BRIEF_EN =
  "MAYDAY here. Checkout on the shop service just went down. Error rate forty-one percent. " +
  "Root cause: commit abc123 pointed the inventory service to a dead port. " +
  "Impact: one hundred fifty euros per minute. I propose to revert that commit; redeploy in ninety seconds.";

// DTMF keypad prompt (reliable — no STT). Trial preamble consumes one keypress,
// so the on-call presses a key first, then 1 / 2 / 3 here.
const KEYPAD_PROMPT_EN =
  "Press 1 to proceed with the fix, 2 to roll back and escalate, or 3 to wait.";
const NO_KEY_EN = "No key detected. I'll wait by default. Goodbye.";

// Fallback flow (no Gradium key): Polly TTS + DTMF keypad via <Gather>.
function buildPollyTwiml(brief: string, callbackUrl: string) {
  const safe = xmlEscape(brief);
  const cb = xmlEscape(callbackUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural" language="en-US">${safe}</Say>
  <Gather input="dtmf" numDigits="1" timeout="15" action="${cb}" method="POST">
    <Say voice="Polly.Joanna-Neural" language="en-US">${xmlEscape(KEYPAD_PROMPT_EN)}</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural" language="en-US">${xmlEscape(NO_KEY_EN)}</Say>
</Response>`;
}

// Gradium voice flow: Gradium TTS speaks the brief (<Play> of our signed TTS
// route), then a DTMF <Gather> captures the decision on the keypad — reliable,
// no STT. The natural Gradium voice is kept for the brief and the prompt.
async function buildGradiumTwiml(origin: string, id: string, state: string | null) {
  const stateQ = state ? `&state=${encodeURIComponent(state)}` : "";
  const cb = `${origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${stateQ}`;
  const briefAudio = xmlEscape(await ttsUrl(origin, `${PHONE_BRIEF_EN} ${KEYPAD_PROMPT_EN}`));
  const promptAudio = xmlEscape(await ttsUrl(origin, KEYPAD_PROMPT_EN));
  const noKeyAudio = xmlEscape(await ttsUrl(origin, NO_KEY_EN));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Play>${briefAudio}</Play>
  <Gather input="dtmf" numDigits="1" timeout="15" action="${xmlEscape(cb)}" method="POST">
    <Play>${promptAudio}</Play>
  </Gather>
  <Play>${noKeyAudio}</Play>
</Response>`;
}

async function placeCall(
  to: string,
  from: string,
  twiml: string,
  sendDigits?: string,
  statusCallback?: string,
): Promise<{ sid?: string }> {
  const body = new URLSearchParams({ To: to, From: from, Twiml: twiml });
  // Auto-press digits after answer — used for human-free end-to-end call tests.
  if (sendDigits) body.set("SendDigits", sendDigits);
  // Real-time call lifecycle events so the screen can show "answered" the
  // instant the on-call human picks up (keynote-style live status).
  if (statusCallback) {
    body.set("StatusCallback", statusCallback);
    body.append("StatusCallbackEvent", "ringing");
    body.append("StatusCallbackEvent", "answered");
    body.append("StatusCallbackEvent", "completed");
    body.set("StatusCallbackMethod", "POST");
  }

  // Preferred: direct Twilio REST API (API Key SK+secret, or Account SID + auth token).
  const creds = twilioCreds();
  if (creds) {
    const res = await fetch(`${creds.base}/2010-04-01/Accounts/${creds.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: twilioBasicAuth(creds),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok)
      throw new Error(`Twilio ${res.status}: ${payload?.message || JSON.stringify(payload)}`);
    return payload;
  }

  // Fallback: Lovable Twilio connector gateway.
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    throw new Error(
      "Twilio not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (or the Lovable Twilio connector)",
    );
  }
  const res = await fetch("https://connector-gateway.lovable.dev/twilio/Calls.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok)
    throw new Error(`Twilio ${res.status}: ${payload?.message || JSON.stringify(payload)}`);
  return payload;
}

function safeHttpUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

// Core call logic, shared by the UI server fn and the ops API route.
export async function placeMaydayCall(opts: {
  to: string;
  from: string;
  origin: string;
  stateUrl?: string;
  sendDigits?: string;
}): Promise<{ id: string; callSid: string | null; voice: "gradium" | "polly" }> {
  if (!/^\+\d{6,15}$/.test(opts.to)) throw new Error("To must be E.164 (+33...)");
  if (!/^\+\d{6,15}$/.test(opts.from)) throw new Error("From must be E.164 Twilio number");
  const { incidentStore } = await import("./store.server");

  const id = `INC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // The VM shop (single process) doubles as shared decision state so the
  // phone webhook and the polling UI agree even across stateless edge isolates.
  const state = safeHttpUrl(opts.stateUrl);
  const useGradium = gradiumConfigured();
  const callback = `${opts.origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
  const twiml = useGradium
    ? await buildGradiumTwiml(opts.origin, id, state)
    : buildPollyTwiml(PHONE_BRIEF_EN, callback);

  incidentStore.set(id, {
    id,
    to: opts.to,
    from: opts.from,
    brief: PHONE_BRIEF_EN,
    callStatus: "queued",
    decision: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const statusCallback = `${opts.origin}/api/public/mayday/status?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;

  try {
    const payload = await placeCall(opts.to, opts.from, twiml, opts.sendDigits, statusCallback);
    const rec = incidentStore.get(id)!;
    rec.callSid = payload.sid;
    rec.updatedAt = Date.now();
    return { id, callSid: payload.sid ?? null, voice: useGradium ? "gradium" : "polly" };
  } catch (e) {
    incidentStore.delete(id);
    throw e;
  }
}

const E164 = /^\+\d{6,15}$/;

export const startMaydayCall = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { to?: string; from?: string; brief?: string; stateUrl?: string }) => input ?? {},
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    const origin = new URL(req.url).origin;
    // Fall back to the account's own numbers if the client didn't provide valid
    // ones — so a fresh session with Twilio configured still rings out of the box.
    let to = data.to;
    let from = data.from;
    if (!E164.test(to || "") || !E164.test(from || "")) {
      const d = await discoverNumbers();
      if (!E164.test(to || "")) to = d.to;
      if (!E164.test(from || "")) from = d.from;
    }
    if (!E164.test(to || "")) {
      throw new Error("No verified To number — verify a caller ID in Twilio or set it in CONFIG");
    }
    if (!E164.test(from || "")) {
      throw new Error("No Twilio From number — set it in CONFIG");
    }
    return placeMaydayCall({ to: to!, from: from!, origin, stateUrl: data.stateUrl });
  });

// What the server can actually do right now — shown in the CONFIG panel so
// the operator sees at a glance whether the real call will work. Also
// auto-discovers the account's From number and the verified To number.
export const getVoiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const numbers = await discoverNumbers();
  return {
    twilioDirect: !!twilioCreds(),
    twilioConnector: !!(process.env.LOVABLE_API_KEY && process.env.TWILIO_API_KEY),
    gradium: gradiumConfigured(),
    gradiumVoice: gradiumVoiceId(),
    suggestedFrom: numbers.from ?? null,
    suggestedTo: numbers.to ?? null,
  };
});

export const getIncidentDecision = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string; stateUrl?: string }) => input)
  .handler(async ({ data }) => {
    const { incidentStore } = await import("./store.server");
    const rec = incidentStore.get(data.id);
    let callStatus = rec?.callStatus ?? null;
    if (rec?.decision) return { decision: rec.decision, callStatus, exists: true };

    // Fallback: read the shared decision + call status held by the VM shop
    // (needed on multi-isolate deploys where in-memory isn't shared).
    const state = safeHttpUrl(data.stateUrl);
    if (state) {
      try {
        const [dRes, sRes] = await Promise.all([
          fetch(`${state}/mayday/decision?id=${encodeURIComponent(data.id)}`, {
            signal: AbortSignal.timeout(3000),
          }),
          fetch(`${state}/mayday/status?id=${encodeURIComponent(data.id)}`, {
            signal: AbortSignal.timeout(3000),
          }).catch(() => null),
        ]);
        if (sRes && sRes.ok) {
          const s = (await sRes.json()) as { status?: string | null };
          if (s.status) {
            callStatus = s.status as typeof callStatus;
            if (rec) rec.callStatus = callStatus;
          }
        }
        if (dRes.ok) {
          const j = (await dRes.json()) as { decision?: string | null };
          if (j.decision === "go" || j.decision === "rollback" || j.decision === "wait") {
            if (rec) {
              rec.decision = j.decision;
              rec.updatedAt = Date.now();
            }
            return { decision: j.decision as IncidentDecision, callStatus, exists: true };
          }
        }
      } catch {
        /* VM unreachable — keep polling */
      }
    }
    return { decision: null as IncidentDecision, callStatus, exists: !!rec };
  });
