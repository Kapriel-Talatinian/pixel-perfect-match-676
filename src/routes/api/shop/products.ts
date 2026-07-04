import { createFileRoute } from "@tanstack/react-router";
import { shopState, recordHit } from "@/lib/shop/store.server";

export const Route = createFileRoute("/api/shop/products")({
  server: {
    handlers: {
      GET: async () => {
        const t = Date.now();
        // Simulate DB latency; if broken, spike + error 50% of reads
        const latency = shopState.broken ? 700 + Math.random() * 400 : 90 + Math.random() * 120;
        await new Promise((r) => setTimeout(r, latency));
        if (shopState.broken && Math.random() < 0.5) {
          recordHit(false, Date.now() - t);
          return new Response(JSON.stringify({ error: shopState.brokenReason }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        recordHit(true, Date.now() - t);
        return Response.json({ products: shopState.products });
      },
    },
  },
});
