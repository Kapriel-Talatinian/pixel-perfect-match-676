// Real document retrieval over docs-corpus, dependency-free (BM25).
//
// The corpus is bundled at build time via Vite `?raw` glob, so it works on the
// edge (Cloudflare Workers) with no filesystem access. Chunks are split by
// `## section`; each chunk keeps {path, section} so citations are genuine.

const rawDocs = import.meta.glob("../../../docs-corpus/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Chunk {
  path: string; // e.g. "runbooks/RB-01-config-regression.md"
  section: string; // e.g. "3. Standard remediation"
  text: string;
  tokens: string[];
}

export interface RetrievalHit {
  doc: string;
  section: string;
  snippet: string;
  score: number;
}

function relPath(absKey: string): string {
  const i = absKey.indexOf("docs-corpus/");
  return i >= 0 ? absKey.slice(i + "docs-corpus/".length) : absKey;
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length > 1);
}

function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const [key, content] of Object.entries(rawDocs)) {
    const path = relPath(key);
    const lines = content.split("\n");
    let title = path;
    let section = "";
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join("\n").trim();
      if (text) {
        chunks.push({
          path,
          section: section || title,
          text,
          tokens: tokenize(`${section} ${text}`),
        });
      }
      buf = [];
    };
    for (const line of lines) {
      const h1 = line.match(/^#\s+(.*)/);
      const h2 = line.match(/^##\s+(.*)/);
      if (h1) {
        title = h1[1].trim();
        continue;
      }
      if (h2) {
        flush();
        section = h2[1].trim();
        continue;
      }
      buf.push(line);
    }
    flush();
  }
  return chunks;
}

// BM25 index, computed once per isolate.
class Bm25 {
  chunks: Chunk[];
  private df = new Map<string, number>();
  private avgdl = 0;
  private k1 = 1.5;
  private b = 0.75;

  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
    let total = 0;
    for (const c of chunks) {
      total += c.tokens.length;
      const seen = new Set(c.tokens);
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgdl = chunks.length ? total / chunks.length : 1;
  }

  private idf(term: string): number {
    const n = this.chunks.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, k = 3): RetrievalHit[] {
    const q = tokenize(query);
    const scored = this.chunks.map((c) => {
      const tf = new Map<string, number>();
      for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const term of q) {
        const f = tf.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        const denom = f + this.k1 * (1 - this.b + (this.b * c.tokens.length) / this.avgdl);
        score += idf * ((f * (this.k1 + 1)) / denom);
      }
      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const max = scored[0]?.score || 1;
    // Keep only the best-scoring chunk per document so top-k spans distinct
    // sources (runbook + past incident + SLA), which is what real triage cites.
    const seen = new Set<string>();
    const out: RetrievalHit[] = [];
    for (const { c, score } of scored) {
      if (score <= 0 || seen.has(c.path)) continue;
      seen.add(c.path);
      out.push({
        doc: c.path,
        section: c.section,
        snippet: snippet(c.text),
        score: Math.round((score / max) * 100) / 100, // normalized 0..1
      });
      if (out.length >= k) break;
    }
    return out;
  }
}

function snippet(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}

let index: Bm25 | null = null;
function getIndex(): Bm25 {
  if (!index) index = new Bm25(buildChunks());
  return index;
}

export function retrieveDocs(query: string, k = 3): RetrievalHit[] {
  return getIndex().search(query, k);
}

export function corpusStats() {
  const idx = getIndex();
  const docs = new Set(idx.chunks.map((c) => c.path));
  return { docs: docs.size, chunks: idx.chunks.length };
}
