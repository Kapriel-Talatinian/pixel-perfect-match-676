import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, Plus, Minus, ArrowRight, PackageCheck, ServerCrash, Activity, ExternalLink, Trash2 } from "lucide-react";

type Product = { id: string; name: string; price: number; stock: number; tag: string };
type Health = { green: boolean; broken: boolean; reason: string; error_rate: number; p95_ms: number; rps: number; orders: number };

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "STAIPH — Field Goods" },
      { name: "description", content: "A tiny live shop wired to the MAYDAY incident-response console." },
    ],
  }),
  component: ShopPage,
});

function eur(n: number) { return `€${n.toFixed(0)}`; }

function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [checkoutMsg, setCheckoutMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const r = await fetch("/api/shop/products", { cache: "no-store" });
      if (!r.ok) { setLoadError(`HTTP ${r.status} — ${await r.text()}`); return; }
      setLoadError("");
      const j = await r.json();
      setProducts(j.products);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/shop/health", { cache: "no-store" });
      setHealth(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadProducts(); loadHealth(); }, [loadProducts, loadHealth]);
  useEffect(() => { const id = setInterval(loadHealth, 3000); return () => clearInterval(id); }, [loadHealth]);

  const inc = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) => setCart((c) => { const n = (c[id] ?? 0) - 1; const { [id]: _, ...rest } = c; return n <= 0 ? rest : { ...rest, [id]: n }; });
  const clear = () => setCart({});

  const total = useMemo(() =>
    Object.entries(cart).reduce((s, [id, q]) => s + (products.find((p) => p.id === id)?.price ?? 0) * q, 0)
  , [cart, products]);

  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const checkout = async () => {
    if (itemCount === 0) return;
    setBusy(true); setCheckoutMsg("");
    try {
      const r = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) }),
      });
      const j = await r.json();
      if (!r.ok) { setCheckoutMsg(`Checkout failed: ${j.error ?? r.statusText}`); }
      else { setCheckoutMsg(`Order ${j.order.id} confirmed — ${eur(j.order.total)}`); clear(); loadProducts(); }
    } catch (e) { setCheckoutMsg(`Network error: ${(e as Error).message}`); }
    finally { setBusy(false); loadHealth(); }
  };

  const broken = health?.broken ?? false;

  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Link to="/shop" className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center bg-primary text-primary-foreground text-mono text-sm font-bold">S</div>
            <div>
              <div className="text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">STAIPH</div>
              <div className="-mt-0.5 text-sm font-semibold">Field Goods</div>
            </div>
          </Link>
          <nav className="flex items-center gap-6 text-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="hidden sm:inline">Catalogue</span>
            <span className="hidden sm:inline">Journal</span>
            <span className="hidden sm:inline">About</span>
            <Link to="/" className="flex items-center gap-1.5 text-foreground hover:text-primary">
              MAYDAY console <ExternalLink className="h-3 w-3" />
            </Link>
          </nav>
        </div>
        {/* Health strip */}
        <div className={`border-t px-6 py-1.5 text-mono text-[11px] ${broken ? "border-danger/50 bg-danger/10 text-danger" : "border-primary/40 bg-primary/[0.06] text-primary"}`}>
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {broken ? <ServerCrash className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
              <span className="uppercase tracking-widest">{broken ? "service degraded" : "all systems nominal"}</span>
              {broken && health?.reason && <span className="hidden truncate text-muted-foreground md:inline">— {health.reason}</span>}
            </div>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>err {(((health?.error_rate ?? 0) * 100)).toFixed(1)}%</span>
              <span>p95 {health?.p95_ms ?? 0}ms</span>
              <span>orders {health?.orders ?? 0}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Catalogue */}
        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="text-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Catalogue · Autumn</div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Everyday equipment</h1>
            </div>
            <span className="text-mono text-xs text-muted-foreground">{products.length} items</span>
          </div>

          {loadError && (
            <div className="mb-4 border border-danger/50 bg-danger/10 px-4 py-3 text-mono text-xs text-danger">
              <div className="flex items-center gap-2"><ServerCrash className="h-4 w-4" /> Failed to load catalogue</div>
              <div className="mt-1 text-muted-foreground">{loadError}</div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <article key={p.id} className="panel flex flex-col overflow-hidden">
                <div className="grid aspect-[4/3] place-items-center border-b border-border/60 bg-gradient-to-br from-muted/60 to-background/60">
                  <div className="text-mono text-4xl font-bold uppercase tracking-tight text-muted-foreground/40">
                    {p.name.split(" ")[0].slice(0, 2)}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    <span className="text-mono text-sm font-bold">{eur(p.price)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{p.tag}</span>
                    <span className={p.stock < 10 ? "text-warning" : ""}>{p.stock} in stock</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => dec(p.id)}
                      disabled={!cart[p.id]}
                      className="grid h-9 w-9 place-items-center border border-border bg-background/60 text-muted-foreground hover:bg-muted disabled:opacity-40"
                      aria-label={`Remove one ${p.name}`}
                    ><Minus className="h-4 w-4" /></button>
                    <div className="grid h-9 flex-1 place-items-center border border-border bg-background/40 text-mono text-sm">
                      {cart[p.id] ?? 0}
                    </div>
                    <button
                      onClick={() => inc(p.id)}
                      className="grid h-9 w-9 place-items-center bg-primary text-primary-foreground hover:brightness-110"
                      aria-label={`Add one ${p.name}`}
                    ><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Admin strip */}
          <AdminBreakStrip broken={broken} onChanged={() => { loadProducts(); loadHealth(); }} />
        </section>

        {/* Cart */}
        <aside className="lg:sticky lg:top-[104px] lg:h-fit">
          <div className="panel">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="text-mono text-xs uppercase tracking-widest text-muted-foreground">Cart</span>
              </div>
              <span className="text-mono text-xs">{itemCount} items</span>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {itemCount === 0 ? (
                <div className="px-4 py-8 text-center text-mono text-xs text-muted-foreground">Empty. Add something.</div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {Object.entries(cart).map(([id, qty]) => {
                    const p = products.find((x) => x.id === id); if (!p) return null;
                    return (
                      <li key={id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{p.name}</div>
                          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">{qty} × {eur(p.price)}</div>
                        </div>
                        <div className="text-mono text-sm font-bold">{eur(p.price * qty)}</div>
                        <button onClick={() => setCart((c) => { const { [id]: _, ...r } = c; return r; })}
                          className="text-muted-foreground hover:text-danger" aria-label="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-border/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-mono text-[11px] uppercase tracking-widest text-muted-foreground">Total</span>
                <span className="text-mono text-xl font-bold tabular-nums">{eur(total)}</span>
              </div>
              <button
                onClick={checkout}
                disabled={itemCount === 0 || busy}
                className="mt-3 flex w-full items-center justify-center gap-2 bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-40"
              >
                {busy ? "Processing…" : <>Checkout <ArrowRight className="h-4 w-4" /></>}
              </button>
              {checkoutMsg && (
                <div className={`mt-3 flex items-start gap-2 border px-3 py-2 text-mono text-[11px] ${checkoutMsg.startsWith("Order") ? "border-primary/40 bg-primary/[0.08] text-primary" : "border-danger/50 bg-danger/10 text-danger"}`}>
                  {checkoutMsg.startsWith("Order") ? <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ServerCrash className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{checkoutMsg}</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel mt-4 px-4 py-3 text-mono text-[11px] text-muted-foreground">
            <div className="uppercase tracking-widest">wired to</div>
            <div className="mt-1 text-foreground">GET /api/shop/health · GET /api/shop/products · POST /api/shop/checkout</div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function AdminBreakStrip({ broken, onChanged }: { broken: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await fetch("/api/shop/admin/break", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ on, reason: "DATABASE_URL misconfigured after deploy abc123" }),
      });
      onChanged();
    } finally { setBusy(false); }
  };
  return (
    <div className="panel mt-8 flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ops · demo control</div>
        <div className="text-sm">Toggle a real regression on the checkout service. The MAYDAY console will react.</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => toggle(true)} disabled={busy || broken}
          className="flex items-center gap-2 border border-danger/60 bg-danger/10 px-4 py-2 text-sm font-bold text-danger hover:bg-danger/20 disabled:opacity-40"
        ><ServerCrash className="h-4 w-4" /> Break production</button>
        <button
          onClick={() => toggle(false)} disabled={busy || !broken}
          className="flex items-center gap-2 border border-border bg-muted px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-40"
        ><Activity className="h-4 w-4" /> Restore</button>
      </div>
    </div>
  );
}
