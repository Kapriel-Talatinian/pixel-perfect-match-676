import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy to trigger / repair a remote shop.
// POST /api/vultr-shop/break  { url, action: "break" | "repair", token? }
// Calls the VM at `${url}/admin/break` or `/admin/repair` with optional bearer token.
export const Route = createFileRoute("/api/vultr-shop/break")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: { url?: string; action?: string; token?: string };
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        const { url, action, token } = payload;
        if (!url || (action !== "break" && action !== "repair")) {
          return Response.json({ ok: false, error: "missing url or action" }, { status: 400 });
        }
        let target: string;
        try {
          const parsed = new URL(url);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
          target = new URL(`/admin/${action}`, parsed).toString();
        } catch {
          return Response.json({ ok: false, error: "invalid url" }, { status: 400 });
        }
        const t0 = Date.now();
        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 4000);
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (token) headers["authorization"] = `Bearer ${token}`;
          const r = await fetch(target, {
            method: "POST",
            headers,
            body: JSON.stringify({ action }),
            signal: ac.signal,
          });
          clearTimeout(timer);
          const text = await r.text();
          let body: unknown = text.slice(0, 400);
          try { body = JSON.parse(text); } catch { /* keep text */ }
          return Response.json({
            ok: r.ok,
            action,
            target,
            upstream_status: r.status,
            upstream_body: body,
            latency_ms: Date.now() - t0,
          }, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          return Response.json({
            ok: false,
            action,
            target,
            error: (e as Error).message,
            latency_ms: Date.now() - t0,
          }, { status: 502, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
