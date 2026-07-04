import { createFileRoute } from "@tanstack/react-router";

// Answer-and-hold TwiML. Used as the inbound handler of the Twilio number
// during self-call tests: the callee leg stays silent while the outbound leg
// exercises the full MAYDAY voice flow (brief → gather/record → webhooks).
export const Route = createFileRoute("/api/public/mayday/hold")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="120"/></Response>`,
          { headers: { "Content-Type": "text/xml; charset=utf-8" } },
        ),
      GET: async () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="120"/></Response>`,
          { headers: { "Content-Type": "text/xml; charset=utf-8" } },
        ),
    },
  },
});
