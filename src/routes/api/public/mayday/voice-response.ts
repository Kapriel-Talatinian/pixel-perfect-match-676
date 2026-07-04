import { createFileRoute } from "@tanstack/react-router";

function twiml(sayFr: string) {
  const safe = sayFr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lea-Neural" language="fr-FR">${safe}</Say><Hangup/></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/mayday/voice-response")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const form = await request.formData();
        const digits = String(form.get("Digits") ?? "");

        const { incidentStore } = await import("@/lib/mayday/store.server");
        const rec = incidentStore.get(id);
        if (!rec) return twiml("Incident inconnu. Fin d'appel.");

        if (digits === "1") {
          rec.decision = "go";
          rec.updatedAt = Date.now();
          return twiml("Rollback confirmé. Je lance le correctif. Merci.");
        }
        if (digits === "2") {
          rec.decision = "rollback";
          rec.updatedAt = Date.now();
          return twiml("Compris. J'escalade à l'équipe d'astreinte. Fin d'appel.");
        }
        if (digits === "3") {
          rec.decision = "wait";
          rec.updatedAt = Date.now();
          return twiml("J'attends. Je vous rappelle si la situation empire.");
        }
        return twiml("Choix non reconnu. J'attends par défaut.");
      },
    },
  },
});
