import { createFileRoute } from "@tanstack/react-router";
import { shopState } from "@/lib/shop/store.server";

// Toggle prod outage for the demo.
export const Route = createFileRoute("/api/shop/admin/break")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}) as { on?: boolean; reason?: string });
        const on = Boolean((body as { on?: boolean }).on);
        shopState.broken = on;
        shopState.brokenReason = on
          ? ((body as { reason?: string }).reason ??
            "DATABASE_URL misconfigured after deploy abc123")
          : "";
        shopState.brokenSince = on ? Date.now() : null;
        if (!on) shopState.hits = { ok: 0, err: 0 };
        return Response.json({ ok: true, broken: shopState.broken });
      },
    },
  },
});
