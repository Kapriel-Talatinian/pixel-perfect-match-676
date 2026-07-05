import { createFileRoute } from "@tanstack/react-router";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Test-only inbound handler: returns a DTMF Gather so an auto-driven self-call
// (Calls API with SendDigits) exercises the full Twilio → webhook → decision
// round trip without a human. Enabled only when ALLOW_CALL_API=1.
export const Route = createFileRoute("/api/public/mayday/gather-test")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

function handle(request: Request) {
  if (process.env.ALLOW_CALL_API !== "1") {
    return new Response("disabled", { status: 403 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "SELFTEST";
  const state = url.searchParams.get("state") ?? "";
  const action = `${url.origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="10" action="${xmlEscape(action)}" method="POST">
    <Say voice="Polly.Joanna-Neural" language="en-US">Test MAYDAY. Press 1 for GO.</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural" language="en-US">No key. Goodbye.</Say>
</Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}
