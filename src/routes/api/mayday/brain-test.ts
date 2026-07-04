import { createFileRoute } from "@tanstack/react-router";

// Ops/debug endpoint: run the real brain once and return the full analysis.
// Guarded by ALLOW_CALL_API so it isn't exposed in production.
export const Route = createFileRoute("/api/mayday/brain-test")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.ALLOW_CALL_API !== "1") {
          return Response.json(
            { ok: false, error: "disabled (set ALLOW_CALL_API=1)" },
            { status: 403 },
          );
        }
        const { runBrainAnalysis } = await import("@/lib/mayday/brain.server");
        const r = await runBrainAnalysis();
        return Response.json(r);
      },
    },
  },
});
