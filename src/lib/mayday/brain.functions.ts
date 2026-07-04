import { createServerFn } from "@tanstack/react-start";

// Run the real document-grounded agent (Vultr Serverless Inference).
export const runBrain = createServerFn({ method: "POST" })
  .inputValidator((input: { error_rate?: number; p95_ms?: number; rps?: number }) => input ?? {})
  .handler(async ({ data }) => {
    const { runBrainAnalysis } = await import("./brain.server");
    return runBrainAnalysis({
      error_rate: data?.error_rate,
      p95_ms: data?.p95_ms,
      rps: data?.rps,
    });
  });

// Whether the brain is wired to Vultr, plus corpus stats — shown in CONFIG.
export const getBrainStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { brainStatus } = await import("./brain.server");
  return brainStatus();
});
