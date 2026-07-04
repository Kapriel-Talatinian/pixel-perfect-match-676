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

// French spoken brief for the actual phone call (the console shows the English one).
export const PHONE_BRIEF_FR =
  "Ici MAYDAY. Le checkout de la boutique vient de tomber. Taux d'erreur : quarante et un pour cent. " +
  "Cause : le commit abc123 a pointé le service d'inventaire vers un port mort. " +
  "Impact : cent cinquante euros par minute. Je propose d'annuler ce commit, redéploiement en quatre-vingt-dix secondes.";

// Fallback flow (no Gradium key): Polly TTS + Twilio ASR via <Gather>.
function buildPollyTwiml(brief: string, callbackUrl: string) {
  const safe = xmlEscape(brief);
  const cb = xmlEscape(callbackUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Lea-Neural" language="fr-FR">${safe}</Say>
  <Gather input="dtmf speech" language="fr-FR" numDigits="1" timeout="12" speechTimeout="auto" hints="go, rollback, wait, vas-y, attends, annule" action="${cb}" method="POST">
    <Say voice="Polly.Lea-Neural" language="fr-FR">Dites GO pour lancer le correctif, ROLLBACK pour annuler et escalader, ou WAIT pour attendre. Vous pouvez aussi taper 1, 2 ou 3.</Say>
  </Gather>
  <Say voice="Polly.Lea-Neural" language="fr-FR">Aucune réponse détectée. J'attends. Au revoir.</Say>
</Response>`;
}

// Real voice flow: Gradium TTS speaks the brief (<Play> of our signed TTS
// route), <Record> captures the spoken reply, the recording webhook runs
// Gradium STT. Digits 1/2/3 still work via finishOnKey. If the caller stays
// fully silent, <Redirect> forces the n=2 path which defaults to "wait".
async function buildGradiumTwiml(origin: string, id: string, state: string | null) {
  const stateQ = state ? `&state=${encodeURIComponent(state)}` : "";
  const cb = `${origin}/api/public/mayday/recording?id=${encodeURIComponent(id)}${stateQ}`;
  const spoken =
    `${PHONE_BRIEF_FR} Après le bip, dites GO pour lancer le correctif, ` +
    `ROLLBACK pour annuler et escalader, ou WAIT pour attendre. Vous pouvez aussi taper 1, 2 ou 3.`;
  const audio = xmlEscape(await ttsUrl(origin, spoken));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Play>${audio}</Play>
  <Record action="${xmlEscape(cb)}" method="POST" maxLength="7" timeout="4" playBeep="true" trim="trim-silence" finishOnKey="123"/>
  <Redirect method="POST">${xmlEscape(`${cb}&n=2`)}</Redirect>
</Response>`;
}

async function placeCall(
  to: string,
  from: string,
  twiml: string,
  sendDigits?: string,
): Promise<{ sid?: string }> {
  const body = new URLSearchParams({ To: to, From: from, Twiml: twiml });
  // Auto-press digits after answer — used for human-free end-to-end call tests.
  if (sendDigits) body.set("SendDigits", sendDigits);

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
    : buildPollyTwiml(PHONE_BRIEF_FR, callback);

  incidentStore.set(id, {
    id,
    to: opts.to,
    from: opts.from,
    brief: PHONE_BRIEF_FR,
    decision: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  try {
    const payload = await placeCall(opts.to, opts.from, twiml, opts.sendDigits);
    const rec = incidentStore.get(id)!;
    rec.callSid = payload.sid;
    rec.updatedAt = Date.now();
    return { id, callSid: payload.sid ?? null, voice: useGradium ? "gradium" : "polly" };
  } catch (e) {
    incidentStore.delete(id);
    throw e;
  }
}

export const startMaydayCall = createServerFn({ method: "POST" })
  .inputValidator((input: { to: string; from: string; brief: string; stateUrl?: string }) => {
    if (!/^\+\d{6,15}$/.test(input.to)) throw new Error("To must be E.164 (+33...)");
    if (!/^\+\d{6,15}$/.test(input.from)) throw new Error("From must be E.164 Twilio number");
    return input;
  })
  .handler(async ({ data }) => {
    const req = getRequest();
    const origin = new URL(req.url).origin;
    return placeMaydayCall({ to: data.to, from: data.from, origin, stateUrl: data.stateUrl });
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
    if (rec?.decision) return { decision: rec.decision, exists: true };

    // Fallback: read the shared decision state held by the VM shop.
    const state = safeHttpUrl(data.stateUrl);
    if (state) {
      try {
        const r = await fetch(`${state}/mayday/decision?id=${encodeURIComponent(data.id)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok) {
          const j = (await r.json()) as { decision?: string | null };
          if (j.decision === "go" || j.decision === "rollback" || j.decision === "wait") {
            if (rec) {
              rec.decision = j.decision;
              rec.updatedAt = Date.now();
            }
            return { decision: j.decision as IncidentDecision, exists: true };
          }
        }
      } catch {
        /* VM unreachable — keep polling */
      }
    }
    return { decision: null as IncidentDecision, exists: !!rec };
  });
