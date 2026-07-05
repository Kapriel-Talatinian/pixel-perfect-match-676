// Shared helpers for the two Twilio webhooks (Gather-based fallback and
// Gradium flow): reply normalization, decision persistence, English spoken lines.

export type Decision = "go" | "rollback" | "wait";

// Normalize a DTMF digit (or spoken keyword, en/fr) to a decision.
export function normalizeReply(digits: string, speech: string): Decision | null {
  if (digits === "1") return "go";
  if (digits === "2") return "rollback";
  if (digits === "3") return "wait";
  const s = speech.toLowerCase();
  if (!s.trim()) return null;
  if (/roll\s?back|escalate|annul|escalad|stop\b|do ?n'?t|surtout pas|non\b/.test(s))
    return "rollback";
  if (/wait|hold|later|attend|patiente|pas (tout de suite|encore)|plus tard/.test(s)) return "wait";
  if (
    /\bgo\b|proceed|yes\b|okay|ok\b|do it|confirm|vas[- ]?y|c'est parti|lance|ouais|oui\b/.test(s)
  )
    return "go";
  return null;
}

export const CONFIRM_EN: Record<Decision, string> = {
  go: "Got it. Reverting the bad commit and redeploying. I'll verify recovery in ninety seconds. Thanks, you can hang up.",
  rollback:
    "Understood, I won't touch it. Escalating to the on-call team with all the evidence. Goodbye.",
  wait: "Alright, I'll hold. I'll call you back if it gets worse.",
};

export const REASK_EN =
  "Sorry, I didn't catch that. Press 1 to proceed, 2 to roll back, or 3 to wait.";
export const DEFAULT_WAIT_EN =
  "No valid response. I'll wait by default and notify the team. Goodbye.";

// Persist a decision: in-memory store (same-isolate) + the VM shop's shared
// decision state (cross-isolate source of truth), best effort.
export async function recordDecision(id: string, decision: Decision, stateUrl: string) {
  const { incidentStore } = await import("./store.server");
  const rec = incidentStore.get(id);
  if (rec) {
    rec.decision = decision;
    rec.updatedAt = Date.now();
  }
  if (stateUrl && /^https?:\/\//.test(stateUrl)) {
    try {
      await fetch(`${new URL(stateUrl).origin}/mayday/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* best effort */
    }
  }
}
