import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { IncidentDecision } from "./store.server";

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

function buildTwiml(brief: string, callbackUrl: string) {
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

function basicAuth(user: string, pass: string) {
  const raw = `${user}:${pass}`;
  if (typeof btoa !== "undefined") return btoa(raw);
  return Buffer.from(raw).toString("base64");
}

async function placeCall(to: string, from: string, twiml: string): Promise<{ sid?: string }> {
  const body = new URLSearchParams({ To: to, From: from, Twiml: twiml });

  // Preferred: direct Twilio REST API with real credentials.
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (accountSid && authToken) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(accountSid, authToken)}`,
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

export const startMaydayCall = createServerFn({ method: "POST" })
  .inputValidator((input: { to: string; from: string; brief: string; stateUrl?: string }) => {
    if (!/^\+\d{6,15}$/.test(input.to)) throw new Error("To must be E.164 (+33...)");
    if (!/^\+\d{6,15}$/.test(input.from)) throw new Error("From must be E.164 Twilio number");
    if (!input.brief || input.brief.length > 800) throw new Error("Brief 1..800 chars");
    return input;
  })
  .handler(async ({ data }) => {
    const { incidentStore } = await import("./store.server");

    const id = `INC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const req = getRequest();
    const origin = new URL(req.url).origin;
    // The VM shop (single process) doubles as shared decision state so the
    // phone webhook and the polling UI agree even across stateless edge isolates.
    const state = safeHttpUrl(data.stateUrl);
    const callback = `${origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
    const twiml = buildTwiml(PHONE_BRIEF_FR, callback);

    incidentStore.set(id, {
      id,
      to: data.to,
      from: data.from,
      brief: data.brief,
      decision: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    try {
      const payload = await placeCall(data.to, data.from, twiml);
      const rec = incidentStore.get(id)!;
      rec.callSid = payload.sid;
      rec.updatedAt = Date.now();
      return { id, callSid: payload.sid ?? null };
    } catch (e) {
      incidentStore.delete(id);
      throw e;
    }
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
