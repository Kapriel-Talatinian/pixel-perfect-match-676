// Shared helpers for the two Twilio webhooks (Gather-based fallback and
// Gradium Record-based flow): reply normalization, decision persistence,
// and the French confirmation lines.

export type Decision = "go" | "rollback" | "wait";

// Normalize a spoken reply (fr) or DTMF digit to a decision.
export function normalizeReply(digits: string, speech: string): Decision | null {
  if (digits === "1") return "go";
  if (digits === "2") return "rollback";
  if (digits === "3") return "wait";
  const s = speech.toLowerCase();
  if (!s.trim()) return null;
  if (/roll\s?back|annul|escalad|stop\b|surtout pas|non\b/.test(s)) return "rollback";
  if (/attend|wait|patiente|pas (tout de suite|encore)|plus tard/.test(s)) return "wait";
  if (/\bgo\b|vas[- ]?y|vazy|c'est parti|lance|ouais|oui\b|ok\b|okay|d'accord|confirme/.test(s))
    return "go";
  return null;
}

export const CONFIRM_FR: Record<Decision, string> = {
  go: "C'est parti. J'annule le commit fautif et je redéploie. Vérification dans quatre-vingt-dix secondes. Merci, vous pouvez raccrocher.",
  rollback:
    "Compris, je n'y touche pas. J'escalade à l'équipe d'astreinte avec toutes les preuves. Fin d'appel.",
  wait: "Très bien, j'attends. Je vous rappelle si la situation empire.",
};

export const REASK_FR =
  "Je n'ai pas compris. Tapez 1 pour lancer, 2 pour annuler, ou 3 pour attendre.";
export const DEFAULT_WAIT_FR =
  "Réponse non reconnue. J'attends par défaut et je préviens l'équipe. Au revoir.";

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
