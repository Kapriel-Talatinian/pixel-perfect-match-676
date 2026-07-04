import { createFileRoute } from "@tanstack/react-router";
import { shopState, recordHit } from "@/lib/shop/store.server";
import { z } from "zod";

const Body = z.object({
  items: z.array(z.object({ id: z.string(), qty: z.number().int().positive() })).min(1),
});

export const Route = createFileRoute("/api/shop/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = Date.now();
        const parsed = Body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          recordHit(false, Date.now() - t);
          return new Response(JSON.stringify({ error: "invalid_payload" }), { status: 400 });
        }
        // If broken, checkout fails hard
        if (shopState.broken) {
          await new Promise((r) => setTimeout(r, 400));
          recordHit(false, Date.now() - t);
          return new Response(JSON.stringify({ error: shopState.brokenReason }), { status: 500 });
        }
        let total = 0;
        let count = 0;
        for (const it of parsed.data.items) {
          const p = shopState.products.find((p) => p.id === it.id);
          if (!p || p.stock < it.qty) {
            recordHit(false, Date.now() - t);
            return new Response(JSON.stringify({ error: "out_of_stock", id: it.id }), { status: 409 });
          }
          p.stock -= it.qty;
          total += p.price * it.qty;
          count += it.qty;
        }
        const order = { id: `ord_${Math.random().toString(36).slice(2, 8)}`, total, items: count, at: Date.now() };
        shopState.orders.unshift(order);
        recordHit(true, Date.now() - t);
        return Response.json({ ok: true, order });
      },
    },
  },
});
