import { createFileRoute } from "@tanstack/react-router";
import { placeMaydayCall } from "@/lib/mayday/call.functions";
import { discoverNumbers } from "@/lib/mayday/twilio.server";

// Ops endpoint to trigger the real call from a terminal (same code path as the
// UI). Disabled unless ALLOW_CALL_API=1 — it costs Twilio credits.
// POST /api/mayday/place-call  {"to"?: "+33...", "from"?: "+1...", "stateUrl"?: "http://vm"}
// Missing to/from fall back to the auto-discovered numbers.
export const Route = createFileRoute("/api/mayday/place-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.ALLOW_CALL_API !== "1") {
          return Response.json(
            { ok: false, error: "disabled (set ALLOW_CALL_API=1)" },
            { status: 403 },
          );
        }
        const body = (await request.json().catch(() => ({}))) as {
          to?: string;
          from?: string;
          stateUrl?: string;
        };
        const discovered = await discoverNumbers();
        const to = body.to || discovered.to;
        const from = body.from || discovered.from;
        if (!to || !from) {
          return Response.json(
            { ok: false, error: "to/from missing and not discoverable", discovered },
            { status: 400 },
          );
        }
        try {
          const origin = new URL(request.url).origin;
          const r = await placeMaydayCall({ to, from, origin, stateUrl: body.stateUrl });
          return Response.json({ ok: true, to, from, ...r });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
        }
      },
    },
  },
});
