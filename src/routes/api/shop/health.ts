import { createFileRoute } from "@tanstack/react-router";
import { computeHealth } from "@/lib/shop/store.server";

export const Route = createFileRoute("/api/shop/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(computeHealth(), {
          headers: { "cache-control": "no-store" },
        }),
    },
  },
});
