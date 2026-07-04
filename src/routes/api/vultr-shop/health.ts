import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy so the browser can poll a remote shop without CORS.
// Usage: GET /api/vultr-shop/health?url=http://192.248.185.175
export const Route = createFileRoute("/api/vultr-shop/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const base = u.searchParams.get("url");
        if (!base) {
          return Response.json({ ok: false, error: "missing url param" }, { status: 400 });
        }
        let target: string;
        try {
          const parsed = new URL(base);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
          target = new URL("/health", parsed).toString();
        } catch {
          return Response.json({ ok: false, error: "invalid url" }, { status: 400 });
        }
        const t0 = Date.now();
        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 3500);
          const r = await fetch(target, { signal: ac.signal, cache: "no-store" });
          clearTimeout(timer);
          const latency = Date.now() - t0;
          let body: unknown = null;
          const text = await r.text();
          try {
            body = JSON.parse(text);
          } catch {
            body = text.slice(0, 200);
          }
          const upstreamOk =
            r.ok &&
            typeof body === "object" &&
            body !== null &&
            (body as { status?: string }).status === "ok";
          return Response.json(
            {
              ok: upstreamOk,
              broken: !upstreamOk,
              reason: upstreamOk
                ? ""
                : `upstream ${r.status} · ${JSON.stringify(body).slice(0, 120)}`,
              latency_ms: latency,
              target,
              upstream_status: r.status,
              upstream_body: body,
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e) {
          return Response.json(
            {
              ok: false,
              broken: true,
              reason: `unreachable · ${(e as Error).message}`,
              latency_ms: Date.now() - t0,
              target,
            },
            { headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
