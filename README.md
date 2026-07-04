# MAYDAY — Autonomous Incident Response

> **"Your infrastructure just called. It fixed itself."**

Un service e-commerce live casse. MAYDAY le détecte, enquête comme un ingénieur senior
(métriques, logs, commits, runbooks cités), décide d'un correctif, **appelle l'astreinte
sur un vrai téléphone** pour approbation vocale (« GO »), applique le fix, vérifie le
retour au vert sur la vraie santé du service, et publie un post-mortem cité et daté.

RAISE Summit Hackathon · Paris · Juillet 2026 · Track **Vultr**.

## La boucle (démo semi-réelle, end-to-end)

```
BREAK (réel) ──► watchdog détecte (health poll 3s) ──► timeline agent : plan,
7 outils, 3 retrievals cités ──► décision revert (0.92) ──► ☎ appel Twilio réel
──► « GO » (voix fr ou touche 1) ──► réparation RÉELLE (shop interne + VM Vultr)
──► vérification sur la vraie santé ──► post-mortem (durée & € réels)
```

- **`/`** — la console MAYDAY : timeline de l'agent, compteur € perdu (150 €/min SLA),
  panneau service, téléphone, post-mortem. Blanc, encre, radius 0.
- **`/shop`** — la boutique interne (vraie API : products/checkout/health, casse pour de vrai).
- **`vm-shop/`** — la boutique FastAPI à déployer sur la VM Vultr (voir `vm-shop/README.md`).

## Démarrer

```bash
npm install
npm run dev        # http://localhost:8080
```

## Config de la démo (bouton CONFIG dans le header)

| Champ | Rôle |
|---|---|
| To (you) | votre numéro E.164, ex. `+336…` — le téléphone qui sonne sur scène |
| From (Twilio) | le numéro Twilio |
| REAL CALL | coché = vrai appel Twilio au moment où le script sonne |
| WATCHDOG | coché = poll santé shop interne + VM toutes les 3 s, incident auto |
| VM URL | `http://192.248.185.175` — le shop live sur Vultr |
| Token | optionnel, si le vm-shop est lancé avec `ADMIN_TOKEN` |

### Clés (Twilio + Gradium)

Poser dans l'environnement du serveur (`.env` en local — chargé automatiquement par
`npm run dev` —, secrets Lovable en prod ; voir `.env.example`) :

| Var | Rôle |
|---|---|
| `TWILIO_ACCOUNT_SID` + `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` | appel sortant + téléchargement de l'enregistrement (ou `TWILIO_AUTH_TOKEN` à la place de la paire SK) |
| `GRADIUM_API_KEY` | voix réelles : **Gradium TTS** (brief parlé) + **Gradium STT** (compréhension de la réponse) |
| `GRADIUM_VOICE_ID` | optionnel — défaut Elise (fr) ; Leo `axlOaUiFyOZhy4nv`, Olivier `vMYQUSzm6GRkJX6d` |
| `ALLOW_CALL_API=1` | optionnel — active `POST /api/mayday/place-call` (déclenchement d'appel par curl) |

Dès que les clés Twilio sont posées, la console **découvre et préremplit toute seule**
le numéro From (numéro du compte) et le To (caller ID vérifié).

### ⚠️ Appel réel vers ton téléphone — la seule étape manuelle

Le compte Twilio fourni est un **compte trial** : il ne peut appeler qu'un numéro
**vérifié**. Le numéro actuellement vérifié est enregistré au **mauvais format**
(`+330688903650`, avec un 0 en trop) → Twilio refuse de le router. À corriger une fois :

1. Console Twilio → **Phone Numbers → Verified Caller IDs → Add a new Caller ID**.
2. Saisir **`+33688903650`** (format E.164 correct, sans le 0 national).
3. Valider par le code reçu par SMS/appel.

_(Cette re-vérification est impossible via l'API sur un compte trial — testé. Alternative :
upgrader le compte, ce qui lève aussi le « press any key » du trial et la restriction de
destinataires.)_ Une fois fait, l'appel réel vers ton téléphone marche immédiatement.

Le panneau CONFIG affiche en direct ce que le serveur sait faire
(« Twilio ■ direct · Gradium ■ TTS+STT »). Sans clé Gradium ⇒ fallback automatique
Polly/`<Gather>` (Twilio ASR). Sans clés Twilio ⇒ mode simulation à l'écran.
**Important :** les webhooks doivent être joignables par Twilio ⇒ l'appel réel a
besoin d'une **URL publique**. Deux options :
- **App déployée** (Lovable Publish) : les webhooks pointent automatiquement sur le
  domaine public. Poser les secrets Twilio/Gradium côté Lovable.
- **Local + tunnel** (`npm run dev` + `npx localtunnel --port 8080` ou ngrok) : le
  dev server charge `.env` tout seul, `vite allowedHosts` accepte déjà les tunnels.
  Idéal en dev car le state en mémoire est partagé (relais de décision garanti).

### Relais de décision (déploiement multi-isolate)

Sur un déploiement edge (Cloudflare/Workers), le webhook Twilio et le polling du
navigateur peuvent tomber sur des isolates différents (mémoire non partagée). La
console relaie donc la décision via l'endpoint `POST/GET /mayday/decision` du
**vm-shop** (source de vérité unique). ⇒ Déployer `vm-shop/main.py` (qui inclut cet
endpoint) sur la VM. En local (un seul process Node) le relais mémoire suffit.

Flux Gradium : TwiML `<Play>` d'une URL TTS signée (HMAC — personne d'autre ne peut
consommer les crédits) → `<Record>` de la réponse → webhook télécharge l'audio chez
Twilio → **Gradium STT (fr)** → « ouais vas-y go » ⇒ GO. Touches **1/2/3** en secours
(finissent l'enregistrement). Incompris ⇒ re-demande une fois ⇒ défaut WAIT.
WAIT ⇒ MAYDAY rappelle 20 s plus tard tant que le service est down.

## Prouvé sur infra réelle ✅

Testé en direct (pas en simulation) :

- **Boucle complète console ↔ vraie VM** : la console surveille `http://192.248.185.175`,
  détecte une panne réelle (`/admin/break` → health 503), déroule l'agent, et le GO
  **répare réellement la VM** (health 200).
- **Vrai appel Twilio de bout en bout** : appel placé sur le réseau téléphonique →
  Twilio exécute le webhook public → un « 1 » tapé sur l'appel → décision `go`
  enregistrée par le vrai webhook. Prouvé sans humain via `SendDigits` (voir
  `scripts/real-e2e.sh`).
- **A→Z réel enchaîné** : casse VM réelle → vrai appel → GO → réparation VM réelle →
  santé vérifiée verte.

Rejouer la preuve (dev server + tunnel + `.env` avec les clés Twilio) :

```bash
npm run dev &                       # port 8080, charge .env
npx localtunnel --port 8080         # → PUBLIC_URL https public
PUBLIC_URL=https://xxx.loca.lt VM=http://192.248.185.175 ./scripts/real-e2e.sh
```

## Scénario scène (3 min)

1. Console au vert, WATCHDOG on, REAL CALL on. Boutique VM ouverte dans un onglet.
2. **Break production** (ou casser la VM : `curl -X POST http://VM/admin/break`).
3. La timeline déroule : alerte, plan, métriques, logs, git, 3 citations runbooks, décision.
4. Le téléphone sonne sur la table. Répondre. Dire **« GO »**.
5. MAYDAY répare réellement (interne + VM), vérifie la vraie santé, passe au vert.
6. Post-mortem cité, durée et € réels. Compteur figé.

Filets de sécurité : sans clés Twilio ⇒ mode simulation (mêmes étapes, boutons à
l'écran) ; VM injoignable ⇒ le shop interne suffit à toute la boucle ; **Reset** répare tout.

## Architecture

```
Console (TanStack Start, React 19, Tailwind v4 — déployée via Lovable/Cloudflare)
 ├─ /api/shop/*              shop interne (state serveur, casse/répare pour de vrai)
 ├─ /api/vultr-shop/*        proxy server-side vers la VM (health/break/repair, zéro CORS)
 ├─ /api/public/mayday/voice-response   webhook TwiML (DTMF + speech fr)
 └─ server fns startMaydayCall / getIncidentDecision (Twilio REST direct ou connecteur)

VM Vultr (192.248.185.175) — vm-shop/main.py (FastAPI)
 ├─ /health /products /checkout        boutique live
 ├─ /admin/break /admin/repair         panne scriptée (Bearer optionnel)
 └─ /mayday/decision                   état partagé de la décision d'appel
     (la mémoire des isolates edge n'est pas partagée ⇒ la VM est la source de vérité)
```

## Notes

- Design : blanc « encre sur papier », Space Grotesk + IBM Plex Mono, radius 0 partout,
  pas de flou ni dégradé — les seuls effets sont des ombres décalées pleines.
- La timeline d'investigation est scénarisée (démo) ; la panne, la détection, l'appel,
  la réparation et la vérification sont réels.
- Déploiement : push sur `main` ⇒ sync Lovable ⇒ publish.
