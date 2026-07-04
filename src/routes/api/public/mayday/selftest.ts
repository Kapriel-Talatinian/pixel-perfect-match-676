import { createFileRoute } from "@tanstack/react-router";
import { recordDecision } from "@/lib/mayday/voice.server";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

// Human-free proof of the real telephony round-trip. Set the Twilio number's
// inbound Voice URL to this route, then place a call to it with SendDigits.
// Guarded by ALLOW_CALL_API so it can't be abused on a public deployment.
//
// First hit (no Digits): return an immediate <Gather> (no long brief) so a
// SendDigits keypress lands in the gather. Second hit (with Digits): record
// the decision to the shared state, exactly like the real voice webhook.
export const Route = createFileRoute("/api/public/mayday/selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.ALLOW_CALL_API !== "1") return xml("<Hangup/>");
        const url = new URL(request.url);
        const id = url.searchParams.get("id") || "SELFTEST";
        const state = url.searchParams.get("state") || "";
        const form = await request.formData();
        const digits = String(form.get("Digits") ?? "");

        if (digits) {
          const decision = digits === "1" ? "go" : digits === "2" ? "rollback" : "wait";
          await recordDecision(id, decision, state);
          return xml(`<Say>Decision ${xmlEscape(decision)} recorded. Goodbye.</Say><Hangup/>`);
        }

        const action = `${url.origin}/api/public/mayday/selftest?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
        return xml(
          `<Gather numDigits="1" timeout="20" action="${xmlEscape(action)}" method="POST"><Say>Press a digit now.</Say></Gather><Say>No input. Goodbye.</Say><Hangup/>`,
        );
      },
      GET: async () => xml("<Say>selftest</Say><Hangup/>"),
    },
  },
});
