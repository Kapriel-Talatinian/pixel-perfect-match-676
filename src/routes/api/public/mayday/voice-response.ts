import { createFileRoute } from "@tanstack/react-router";
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

function say(sayFr: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural" language="en-US">${xmlEscape(sayFr)}</Say><Hangup/></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

function reAsk(callbackUrl: string) {
  const cb = xmlEscape(callbackUrl);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="12" action="${cb}" method="POST">
    <Say voice="Polly.Joanna-Neural" language="en-US">${xmlEscape(REASK_EN)}</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural" language="en-US">Still nothing. I'll wait by default. Goodbye.</Say>
</Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

// Fallback webhook (Polly/<Gather> flow): Twilio's own ASR or DTMF digits.
export const Route = createFileRoute("/api/public/mayday/voice-response")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const attempt = Number(url.searchParams.get("n") ?? "1");
        const form = await request.formData();
        const digits = String(form.get("Digits") ?? "");
        const speech = String(form.get("SpeechResult") ?? "");

        const { incidentStore } = await import("@/lib/mayday/store.server");
        if (!incidentStore.get(id) && !state) return say("Unknown incident. Ending the call.");

        const decision = normalizeReply(digits, speech);
        if (decision) {
          await recordDecision(id, decision, state);
          return say(CONFIRM_EN[decision]);
        }

        // Unclear reply → re-ask once, then default to wait.
        if (attempt < 2) {
          const cb = `${url.origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}&n=2`;
          return reAsk(cb);
        }
        await recordDecision(id, "wait", state);
        return say(DEFAULT_WAIT_EN);
      },
    },
  },
});
