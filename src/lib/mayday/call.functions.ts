import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function buildTwiml(brief: string, callbackUrl: string) {
  // Basic XML escape for the brief text
  const safe = brief
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Lea-Neural" language="fr-FR">Alerte Mayday. ${safe}</Say>
  <Gather numDigits="1" action="${callbackUrl}" method="POST" timeout="15">
    <Say voice="Polly.Lea-Neural" language="fr-FR">Tapez 1 pour lancer le rollback, 2 pour annuler et escalader, 3 pour attendre.</Say>
  </Gather>
  <Say voice="Polly.Lea-Neural" language="fr-FR">Aucune réponse détectée. J'attends.</Say>
</Response>`;
}

export const startMaydayCall = createServerFn({ method: "POST" })
  .inputValidator((input: { to: string; from: string; brief: string }) => {
    if (!/^\+\d{6,15}$/.test(input.to)) throw new Error("To must be E.164 (+33...)");
    if (!/^\+\d{6,15}$/.test(input.from)) throw new Error("From must be E.164 Twilio number");
    if (!input.brief || input.brief.length > 800) throw new Error("Brief 1..800 chars");
    return input;
  })
  .handler(async ({ data }) => {
    const { incidentStore } = await import("./store.server");
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      throw new Error("Twilio not configured (missing LOVABLE_API_KEY or TWILIO_API_KEY)");
    }

    const id = `INC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const req = getRequest();
    const origin = new URL(req.url).origin;
    const callback = `${origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}`;
    const twiml = buildTwiml(data.brief, callback);

    incidentStore.set(id, {
      id,
      to: data.to,
      from: data.from,
      brief: data.brief,
      decision: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const body = new URLSearchParams({
      To: data.to,
      From: data.from,
      Twiml: twiml,
    });

    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Calls.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) {
      incidentStore.delete(id);
      throw new Error(`Twilio ${res.status}: ${payload?.message || JSON.stringify(payload)}`);
    }
    const rec = incidentStore.get(id)!;
    rec.callSid = payload.sid;
    rec.updatedAt = Date.now();
    return { id, callSid: payload.sid ?? null };
  });

export const getIncidentDecision = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { incidentStore } = await import("./store.server");
    const rec = incidentStore.get(data.id);
    if (!rec) return { decision: null as IncidentDecision, exists: false };
    return { decision: rec.decision, exists: true };
  });
