# vm-shop — le shop live sur la VM Vultr

Un seul fichier FastAPI. La console MAYDAY le surveille via `/health`, le casse via
`POST /admin/break` et le répare via `POST /admin/repair` (proxy `/api/vultr-shop/*`).

## Déploiement sur la VM (192.248.185.175)

```bash
# depuis ce repo
scp vm-shop/main.py root@192.248.185.175:/opt/mayday-shop/main.py

# sur la VM (une seule fois)
ssh root@192.248.185.175
pip install fastapi uvicorn
# ADMIN_TOKEN est optionnel — si défini, mettre le même token dans CONFIG sur la console
ADMIN_TOKEN=changeme uvicorn main:app --host 0.0.0.0 --port 80
```

Si l'app tourne déjà via systemd/docker, remplacer `main.py` et redémarrer le service.

## Contrat

| Route | Effet |
|---|---|
| `GET /health` | `{"status":"ok"}` — ou **500** `{"status":"error","reason":…}` en panne |
| `POST /admin/break` | active la panne (checkout + catalogue 500) |
| `POST /admin/repair` | répare |
| `GET /products` / `POST /checkout` | boutique réelle, 500 en panne |
| `GET /` | vitrine HTML (blanc, radius 0, même style que la console) |

## Test rapide

```bash
curl http://192.248.185.175/health
curl -X POST http://192.248.185.175/admin/break -H 'Authorization: Bearer changeme'
curl http://192.248.185.175/health   # → 500 status error
curl -X POST http://192.248.185.175/admin/repair -H 'Authorization: Bearer changeme'
```
