import { createFileRoute } from "@tanstack/react-router";
import { gradiumConfigured, gradiumTts, verifyText } from "@/lib/mayday/gradium.server";

// Public audio endpoint fetched by Twilio <Play>. Signed with HMAC(GRADIUM_API_KEY)
// so third parties can't burn TTS credits through it.
export const Route = createFileRoute("/api/public/mayday/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text") ?? "";
        const sig = url.searchParams.get("sig") ?? "";
        if (!gradiumConfigured()) {
          return new Response("Gradium not configured", { status: 503 });
        }
        if (!text || text.length > 900) {
          return new Response("text required (<=900 chars)", { status: 400 });
        }
        if (!(await verifyText(text, sig))) {
          return new Response("bad signature", { status: 403 });
        }
        try {
          const { bytes, contentType } = await gradiumTts(text);
          return new Response(bytes, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          return new Response(`tts failed: ${(e as Error).message}`, { status: 502 });
        }
      },
    },
  },
});
