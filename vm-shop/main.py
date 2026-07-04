# MAYDAY Store — tiny live e-commerce for the MAYDAY demo (single file).
#
# Run on the Vultr VM:
#   pip install fastapi uvicorn
#   ADMIN_TOKEN=changeme uvicorn main:app --host 0.0.0.0 --port 80
#
# Endpoints (the MAYDAY console talks to all of them through its proxy):
#   GET  /            HTML storefront (white, ink-on-paper, matches the console)
#   GET  /health      {"status":"ok"} — or HTTP 500 {"status":"error",...} when broken
#   GET  /products    catalogue JSON (500 when broken)
#   POST /checkout    {"items":[{"id","qty"}]} → order JSON (500 when broken)
#   POST /admin/break  flip the outage on   (optional Bearer ADMIN_TOKEN)
#   POST /admin/repair flip the outage off  (optional Bearer ADMIN_TOKEN)

import os
import time
import random
import string

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
BREAK_REASON = "INVENTORY_SERVICE_URL → dead port :9999 after deploy abc123"

app = FastAPI(title="MAYDAY Store", version="0.2.0")

STATE = {"broken": False, "since": None, "orders": 0}

# Shared decision store for the MAYDAY phone-approval flow. The console's server
# functions may run on stateless edge isolates, so the VM (single process) holds
# the source of truth: the Twilio webhook writes here, the console polls here.
DECISIONS: dict[str, str] = {}

PRODUCTS = [
    {"id": "sku-01", "name": "Field Notebook · A5", "price": 18, "stock": 42, "tag": "paper"},
    {"id": "sku-02", "name": "Merino Crew · Charcoal", "price": 89, "stock": 17, "tag": "wear"},
    {"id": "sku-03", "name": "Titanium Pen", "price": 54, "stock": 23, "tag": "edc"},
    {"id": "sku-04", "name": "Canvas Tote · Olive", "price": 32, "stock": 61, "tag": "carry"},
    {"id": "sku-05", "name": "Ceramic Mug 300ml", "price": 22, "stock": 88, "tag": "home"},
    {"id": "sku-06", "name": "Linen Shirt · Ecru", "price": 120, "stock": 9, "tag": "wear"},
]


def check_admin(request: Request) -> None:
    if ADMIN_TOKEN and request.headers.get("authorization") != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="bad admin token")


@app.get("/health")
def health():
    if STATE["broken"]:
        return JSONResponse(
            {"status": "error", "reason": BREAK_REASON, "since": STATE["since"]},
            status_code=500,
        )
    return {"status": "ok", "orders": STATE["orders"]}


@app.post("/admin/break")
async def admin_break(request: Request):
    check_admin(request)
    STATE["broken"] = True
    STATE["since"] = time.time()
    return {"ok": True, "broken": True, "reason": BREAK_REASON}


@app.post("/admin/repair")
async def admin_repair(request: Request):
    check_admin(request)
    STATE["broken"] = False
    STATE["since"] = None
    return {"ok": True, "broken": False}


@app.post("/mayday/decision")
async def set_decision(request: Request):
    body = await request.json()
    inc_id = str(body.get("id", ""))
    decision = str(body.get("decision", ""))
    if not inc_id or decision not in ("go", "rollback", "wait"):
        raise HTTPException(status_code=400, detail="bad payload")
    DECISIONS[inc_id] = decision
    return {"ok": True, "id": inc_id, "decision": decision}


@app.get("/mayday/decision")
def get_decision(id: str = ""):
    return {"id": id, "decision": DECISIONS.get(id)}


@app.get("/products")
def products():
    if STATE["broken"]:
        raise HTTPException(status_code=500, detail=BREAK_REASON)
    return {"products": PRODUCTS}


@app.post("/checkout")
async def checkout(request: Request):
    if STATE["broken"]:
        raise HTTPException(status_code=500, detail=BREAK_REASON)
    body = await request.json()
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="empty cart")
    total = 0
    count = 0
    for it in items:
        p = next((p for p in PRODUCTS if p["id"] == it.get("id")), None)
        qty = int(it.get("qty", 0))
        if p is None or qty <= 0 or p["stock"] < qty:
            raise HTTPException(status_code=409, detail=f"out of stock: {it.get('id')}")
        p["stock"] -= qty
        total += p["price"] * qty
        count += qty
    STATE["orders"] += 1
    order_id = "ord_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return {"ok": True, "order": {"id": order_id, "total": total, "items": count}}


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAYDAY Store</title>
<style>
  * { box-sizing: border-box; border-radius: 0 !important; }
  body { margin: 0; background: #fff; color: #111; font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; }
  .mono { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; }
  header { border-bottom: 1px solid #111; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .logo { display: flex; gap: 12px; align-items: center; }
  .logo .m { width: 32px; height: 32px; background: #111; color: #fff; display: grid; place-items: center; font-weight: 700; }
  #strip { border-bottom: 1px solid #111; padding: 6px 24px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
  #strip.down { background: #b91c1c; color: #fff; }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .card { border: 1px solid #111; }
  .card .ph { aspect-ratio: 4/3; background: #f4f4f4; border-bottom: 1px solid #111; display: grid; place-items: center; font-size: 40px; font-weight: 700; color: #bbb; }
  .card .b { padding: 12px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  button { background: #111; color: #fff; border: 0; padding: 10px 14px; font: inherit; font-weight: 700; cursor: pointer; width: 100%; margin-top: 10px; }
  button:hover { opacity: .85; }
  #msg { margin: 16px 0; padding: 10px 12px; border: 1px solid #111; font-size: 13px; display: none; }
  #msg.err { border-color: #b91c1c; color: #b91c1c; }
</style>
</head>
<body>
<header>
  <div class="logo"><div class="m">S</div><div><div class="mono" style="font-size:10px;letter-spacing:.25em">STAIPH</div><b>Field Goods</b></div></div>
  <span class="mono" style="font-size:11px">MAYDAY Store · live on Vultr</span>
</header>
<div id="strip" class="mono">checking…</div>
<main>
  <div id="msg" class="mono"></div>
  <div class="grid" id="grid"></div>
</main>
<script>
async function health() {
  const s = document.getElementById('strip');
  try {
    const r = await fetch('/health', {cache: 'no-store'});
    const j = await r.json();
    if (r.ok && j.status === 'ok') { s.textContent = 'all systems nominal'; s.className = 'mono'; }
    else { s.textContent = 'service degraded — ' + (j.reason || 'unknown'); s.className = 'mono down'; }
  } catch { s.textContent = 'unreachable'; s.className = 'mono down'; }
}
async function load() {
  const g = document.getElementById('grid');
  try {
    const r = await fetch('/products', {cache: 'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    g.innerHTML = j.products.map(p => `
      <div class="card"><div class="ph mono">${p.name.slice(0,2).toUpperCase()}</div>
      <div class="b"><div class="row"><b>${p.name}</b><span class="mono">€${p.price}</span></div>
      <div class="row mono" style="font-size:10px;text-transform:uppercase;color:#666"><span>${p.tag}</span><span>${p.stock} in stock</span></div>
      <button onclick="buy('${p.id}')">Buy</button></div></div>`).join('');
  } catch (e) { g.innerHTML = '<div class="mono" style="color:#b91c1c">catalogue unavailable — ' + e.message + '</div>'; }
}
async function buy(id) {
  const m = document.getElementById('msg');
  m.style.display = 'block';
  try {
    const r = await fetch('/checkout', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({items: [{id, qty: 1}]})});
    const j = await r.json();
    if (!r.ok) { m.className = 'mono err'; m.textContent = 'Checkout failed: ' + (j.detail || r.status); }
    else { m.className = 'mono'; m.textContent = 'Order ' + j.order.id + ' confirmed — €' + j.order.total; load(); }
  } catch (e) { m.className = 'mono err'; m.textContent = 'Network error: ' + e.message; }
}
health(); load(); setInterval(health, 3000);
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def home():
    return PAGE
