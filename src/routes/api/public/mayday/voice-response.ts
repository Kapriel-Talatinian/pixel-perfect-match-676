import { createFileRoute } from "@tanstack/react-router";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function say(sayFr: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lea-Neural" language="fr-FR">${xmlEscape(sayFr)}</Say><Hangup/></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

function reAsk(callbackUrl: string) {
  const cb = xmlEscape(callbackUrl);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" language="fr-FR" numDigits="1" timeout="10" speechTimeout="auto" hints="go, rollback, wait, vas-y, attends, annule" action="${cb}" method="POST">
    <Say voice="Polly.Lea-Neural" language="fr-FR">Je n'ai pas compris. Dites GO, ROLLBACK, ou WAIT. Ou tapez 1, 2 ou 3.</Say>
  </Gather>
  <Say voice="Polly.Lea-Neural" language="fr-FR">Toujours rien. J'attends par défaut. Au revoir.</Say>
</Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

// Normalize a spoken reply or DTMF digit to a decision.
function normalize(digits: string, speech: string): "go" | "rollback" | "wait" | null {
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

export const Route = createFileRoute("/api/public/mayday/voice-response")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const attempt = Number(url.searchParams.get("n") ?? "1");
        const form = await request.formData();
        const digits = String(form.get("Digits") ?? "");
        const speech = String(form.get("SpeechResult") ?? "");

        const { incidentStore } = await import("@/lib/mayday/store.server");
        const rec = incidentStore.get(id);

        const record = async (decision: "go" | "rollback" | "wait") => {
          if (rec) {
            rec.decision = decision;
            rec.updatedAt = Date.now();
          }
          // Mirror into the VM's shared decision state (edge isolates don't share memory).
          if (state && /^https?:\/\//.test(state)) {
            try {
              await fetch(`${new URL(state).origin}/mayday/decision`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id, decision }),
                signal: AbortSignal.timeout(3000),
              });
            } catch {
              /* best effort */
            }
          }
        };

        if (!rec && !state) return say("Incident inconnu. Fin d'appel.");

        const decision = normalize(digits, speech);

        if (decision === "go") {
          await record("go");
          return say(
            "C'est parti. J'annule le commit fautif et je redéploie. Vérification dans quatre-vingt-dix secondes. Merci, vous pouvez raccrocher.",
          );
        }
        if (decision === "rollback") {
          await record("rollback");
          return say(
            "Compris, je n'y touche pas. J'escalade à l'équipe d'astreinte avec toutes les preuves. Fin d'appel.",
          );
        }
        if (decision === "wait") {
          await record("wait");
          return say("Très bien, j'attends. Je vous rappelle si la situation empire.");
        }

        // Unclear reply → re-ask once, then default to wait.
        if (attempt < 2) {
          const cb = `${url.origin}/api/public/mayday/voice-response?id=${encodeURIComponent(id)}${state ? `&state=${encodeURIComponent(state)}` : ""}&n=2`;
          return reAsk(cb);
        }
        await record("wait");
        return say(
          "Réponse non reconnue. J'attends par défaut et je préviens l'équipe. Au revoir.",
        );
      },
    },
  },
});
