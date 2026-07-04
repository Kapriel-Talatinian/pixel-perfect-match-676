#!/usr/bin/env bash
# Preuve A→Z sur infra RÉELLE : casse la vraie boutique VM, place un VRAI appel
# Twilio auto-piloté (SendDigits GO), vérifie que la décision remonte par le vrai
# webhook, répare la VM, et vérifie le retour au vert.
#
# Pré-requis :
#   - dev server lancé (npm run dev, port 8080) OU l'app déployée
#   - un tunnel HTTPS public vers ce port (ex: npx localtunnel --port 8080) → PUBLIC_URL
#   - .env chargé avec les clés Twilio (TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID / _SECRET)
#   - la vraie boutique VM qui expose /admin/break, /admin/repair, /health et /mayday/decision
#
# Usage :
#   PUBLIC_URL=https://xxx.loca.lt VM=http://192.248.185.175 ./scripts/real-e2e.sh
set -euo pipefail

: "${PUBLIC_URL:?exporte PUBLIC_URL (tunnel https public vers le port 8080)}"
VM="${VM:-http://192.248.185.175}"
# état partagé pour la décision : par défaut la VM elle-même (doit avoir /mayday/decision)
STATE="${STATE:-$VM}"

# Charge .env si présent
[ -f .env ] && set -a && . ./.env && set +a
SID="${TWILIO_ACCOUNT_SID:?}"
USER_ID="${TWILIO_API_KEY_SID:-$SID}"
PASS="${TWILIO_API_KEY_SECRET:-${TWILIO_AUTH_TOKEN:?}}"
NUM_FROM="${FROM:-+12693994538}"
NUM_TO="${TO:-+12693994538}"   # trial: doit être vérifié (self-call par défaut)

api() { curl -s -u "$USER_ID:$PASS" "$@"; }
ID="e2e$RANDOM"
VURL="$PUBLIC_URL/api/public/mayday/selftest?id=$ID&state=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$STATE")"

echo "══ [1] CASSE réelle de la boutique VM ══"
curl -s -m8 -X POST "$VM/admin/break" >/dev/null
curl -s -m8 -o /dev/null -w "   santé VM = %{http_code} (503 attendu)\n" "$VM/health"

echo "══ [2] pointe le numéro Twilio sur le webhook + VRAI appel (SendDigits GO) ══"
NUMSID=$(api "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers.json?PhoneNumber=$NUM_FROM" | python3 -c "import json,sys;print(json.load(sys.stdin)['incoming_phone_numbers'][0]['sid'])")
api -X POST "https://api.twilio.com/2010-04-01/Accounts/$SID/IncomingPhoneNumbers/$NUMSID.json" --data-urlencode "VoiceUrl=$VURL" --data-urlencode "VoiceMethod=POST" -o /dev/null
CALL=$(api -X POST "https://api.twilio.com/2010-04-01/Accounts/$SID/Calls.json" \
  --data-urlencode "To=$NUM_TO" --data-urlencode "From=$NUM_FROM" \
  --data-urlencode "Url=$VURL" --data-urlencode "Method=POST" \
  --data-urlencode "SendDigits=wwwwwwwwwwwwwwww1wwwwww1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('sid') or 'ERR')")
echo "   appel: $CALL (id=$ID)"

echo "══ [3] attente de la décision GO (via le vrai appel) ══"
for i in $(seq 1 25); do
  D=$(curl -s -m3 "$STATE/mayday/decision?id=$ID" || true)
  echo "$D" | grep -q '"go"' && break
  sleep 3
done
echo "   décision: $D"

if echo "$D" | grep -q '"go"'; then
  echo "══ [4] GO → RÉPARATION réelle VM + vérif ══"
  curl -s -m8 -X POST "$VM/admin/repair" >/dev/null
  code=$(curl -s -m8 -o /dev/null -w "%{http_code}" "$VM/health")
  echo "   santé VM = $code"
  [ "$code" = "200" ] && echo "   ✅ A→Z RÉEL OK" || { echo "   ❌ pas vert"; exit 1; }
else
  curl -s -m8 -X POST "$VM/admin/repair" >/dev/null
  echo "   ❌ décision non reçue (tunnel ? gate trial ?) — VM réparée par sécurité"; exit 1
fi
