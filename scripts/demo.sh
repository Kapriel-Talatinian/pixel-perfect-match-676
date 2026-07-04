#!/usr/bin/env bash
# Lanceur de démo "1 commande" : démarre le dev server + un tunnel public
# cloudflared, puis affiche l'URL à ouvrir dans le navigateur. C'est cette URL
# PUBLIQUE qu'il faut ouvrir pour que « Break production » déclenche un VRAI appel
# (Twilio doit pouvoir joindre les webhooks — impossible sur localhost).
#
# Pré-requis : .env rempli (clés Twilio ; Vultr/Gradium optionnels), cloudflared
# installé (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
#
# Usage : ./scripts/demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
CF_BIN="${CLOUDFLARED:-cloudflared}"

command -v "$CF_BIN" >/dev/null || { echo "❌ cloudflared introuvable — installe-le d'abord."; exit 1; }
[ -f .env ] || echo "⚠ pas de .env — l'appel réel ne marchera pas sans les clés Twilio."

# 1. dev server (s'il ne tourne pas déjà)
if ! curl -s -m 3 "http://localhost:$PORT/api/shop/health" >/dev/null 2>&1; then
  echo "▶ démarrage du dev server (port $PORT)…"
  (npm run dev >/tmp/mayday-dev.log 2>&1 &)
  for i in $(seq 1 30); do
    curl -s -m 2 "http://localhost:$PORT/api/shop/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi
echo "✓ dev server en ligne (localhost:$PORT)"

# 2. tunnel public
echo "▶ ouverture du tunnel cloudflared…"
CF_LOG=$(mktemp)
("$CF_BIN" tunnel --url "http://localhost:$PORT" --no-autoupdate >"$CF_LOG" 2>&1 &)
URL=""
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "❌ tunnel non obtenu — voir $CF_LOG"; exit 1; }

cat <<EOF

════════════════════════════════════════════════════════════════
  ✅ Démo prête. OUVRE CETTE URL DANS TON NAVIGATEUR :

      $URL

  Puis : CONFIG → coche REAL CALL (numéros déjà préremplis)
         → Break production → ton téléphone sonne → décroche
         → touche pour le préambule trial → écoute → tape 1 (GO)

  ⛔ N'ouvre PAS localhost:$PORT pour l'appel réel — Twilio ne peut
     pas joindre un webhook localhost. Utilise l'URL ci-dessus.
════════════════════════════════════════════════════════════════

(Ctrl-C pour arrêter le tunnel)
EOF
wait
