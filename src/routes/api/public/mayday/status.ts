import { createFileRoute } from "@tanstack/react-router";
import type { CallStatus } from "@/lib/mayday/store.server";

// Twilio StatusCallback webhook. Fires on ringing / answered / completed so the
// console can show "answered" the instant the on-call human picks up.
export const Route = createFileRoute("/api/public/mayday/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const form = await request.formData();
        const raw = String(form.get("CallStatus") ?? "");

        // Twilio "in-progress" == the callee answered.
        const status: CallStatus = (raw || null) as CallStatus;

        const { incidentStore } = await import("@/lib/mayday/store.server");
        const rec = incidentStore.get(id);
        if (rec) {
          rec.callStatus = status;
          rec.updatedAt = Date.now();
        }

        // Best-effort relay to the shared state (multi-isolate deploys).
        if (state && /^https?:\/\//.test(state)) {
          try {
            await fetch(`${new URL(state).origin}/mayday/status`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id, status }),
              signal: AbortSignal.timeout(3000),
            });
          } catch {
            /* VM has no /mayday/status — harmless */
          }
        }

        // Twilio ignores the body of a StatusCallback; return a valid 200.
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      },
    },
  },
});
