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
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | appel sortant + téléchargement de l'enregistrement |
| `GRADIUM_API_KEY` | voix réelles : **Gradium TTS** (brief parlé) + **Gradium STT** (compréhension de la réponse) |
| `GRADIUM_VOICE_ID` | optionnel — défaut Elise (fr) ; Leo `axlOaUiFyOZhy4nv`, Olivier `vMYQUSzm6GRkJX6d` |

Le panneau CONFIG affiche en direct ce que le serveur sait faire
(« Twilio ■ direct · Gradium ■ TTS+STT »). Sans clé Gradium ⇒ fallback automatique
Polly/`<Gather>` (Twilio ASR). Sans clés Twilio ⇒ mode simulation à l'écran.
**Important :** les webhooks doivent être joignables par Twilio ⇒ l'appel réel ne
fonctionne que sur l'app **déployée** (URL publique), pas sur localhost.

Flux Gradium : TwiML `<Play>` d'une URL TTS signée (HMAC — personne d'autre ne peut
consommer les crédits) → `<Record>` de la réponse → webhook télécharge l'audio chez
Twilio → **Gradium STT (fr)** → « ouais vas-y go » ⇒ GO. Touches **1/2/3** en secours
(finissent l'enregistrement). Incompris ⇒ re-demande une fois ⇒ défaut WAIT.
WAIT ⇒ MAYDAY rappelle 20 s plus tard tant que le service est down.

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
