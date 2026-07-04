// In-memory shop state (single-Worker demo).
export type Product = {
  id: string;
  name: string;
  price: number; // EUR
  stock: number;
  tag: string;
};

export type ShopState = {
  products: Product[];
  orders: Array<{ id: string; total: number; items: number; at: number }>;
  broken: boolean; // toggled by /api/shop/admin/break
  brokenSince: number | null;
  brokenReason: string;
  hits: { ok: number; err: number };
  latencyMs: number; // p95 sample
};

const seed: Product[] = [
  { id: "sku-01", name: "Field Notebook · A5", price: 18, stock: 42, tag: "paper" },
  { id: "sku-02", name: "Merino Crew · Charcoal", price: 89, stock: 17, tag: "wear" },
  { id: "sku-03", name: "Titanium Pen", price: 54, stock: 23, tag: "edc" },
  { id: "sku-04", name: "Canvas Tote · Olive", price: 32, stock: 61, tag: "carry" },
  { id: "sku-05", name: "Ceramic Mug 300ml", price: 22, stock: 88, tag: "home" },
  { id: "sku-06", name: "Linen Shirt · Ecru", price: 120, stock: 9, tag: "wear" },
];

const g = globalThis as unknown as { __shopState?: ShopState };
if (!g.__shopState) {
  g.__shopState = {
    products: seed.map((p) => ({ ...p })),
    orders: [],
    broken: false,
    brokenSince: null,
    brokenReason: "",
    hits: { ok: 0, err: 0 },
    latencyMs: 168,
  };
}

export const shopState: ShopState = g.__shopState;

export function recordHit(ok: boolean, ms: number) {
  if (ok) shopState.hits.ok++;
  else shopState.hits.err++;
  // rolling p95-ish
  shopState.latencyMs = Math.round(shopState.latencyMs * 0.8 + ms * 0.2);
}

export function computeHealth() {
  const total = shopState.hits.ok + shopState.hits.err;
  const error_rate = total === 0 ? 0 : shopState.hits.err / total;
  return {
    green: !shopState.broken && error_rate < 0.05,
    broken: shopState.broken,
    reason: shopState.brokenReason,
    since: shopState.brokenSince,
    error_rate: Number(error_rate.toFixed(4)),
    p95_ms: shopState.latencyMs,
    rps: total,
    orders: shopState.orders.length,
  };
}
