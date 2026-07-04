export type Phase =
  | "idle"
  | "alert"
  | "investigating"
  | "deciding"
  | "calling"
  | "ringing"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "fixing"
  | "verifying"
  | "resolved";

export type EventType =
  | "alert"
  | "plan"
  | "tool_call"
  | "tool_result"
  | "retrieval"
  | "decision"
  | "calling"
  | "approval"
  | "fixing"
  | "verifying"
  | "resolved"
  | "postmortem";

export interface TimelineEvent {
  id: string;
  ts: string;
  type: EventType;
  title: string;
  body?: string;
  meta?: Record<string, string | number>;
  citations?: { doc: string; section: string; snippet: string; score: number }[];
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
}

export interface Decision {
  incident_id: string;
  diagnosis: string;
  bad_commit: string;
  action: "revert" | "patch" | "escalate";
  confidence: number;
  citations: { doc: string; section: string }[];
  sla_impact_eur_per_min: number;
  requires_approval: boolean;
}

export interface Metrics {
  error_rate: number;
  p95_ms: number;
  rps: number;
  green: boolean;
}

export const INCIDENT_ID = "inc-20260704-001";

export const PHONE_BRIEF = `MAYDAY here. At 4:02 pm checkout on the shop service went down. Error rate 41 percent. Root cause: commit abc123 changed the inventory URL to a dead port. Cost to the business: 150 euros per minute. I propose to revert commit abc123 — CI redeploys in 90 seconds. Say GO to proceed, ROLLBACK, or WAIT.`;

export const POSTMORTEM = `# Post-mortem — INC-20260704-001

**Summary.** Checkout on the shop service was unavailable for 3m 42s starting 16:02:07 UTC. Auto-detected by Grafana; auto-remediated by MAYDAY with on-call phone approval.

## Timeline
- **16:02:07** — error_rate crossed 0.20 threshold (peak 0.41).
- **16:02:09** — MAYDAY opened incident, ran 4 tools, retrieved 3 documents.
- **16:03:14** — Decision: revert commit \`abc123\` (confidence 0.92).
- **16:03:18** — Outbound call placed to on-call engineer.
- **16:04:41** — Human said "GO". Revert pushed to \`main\`.
- **16:05:49** — CI/CD deployed \`9f8e7d\`. error_rate returned to baseline.

## Root cause
Commit \`abc123\` (author: p1) edited \`shop/settings.py\` and pointed \`INVENTORY_SERVICE_URL\` to port \`:9999\` — no service listens there. \`/checkout\` began returning 500 on every stock lookup within 30s.

## Resolution
\`git revert --no-edit abc123\` → push to \`main\` → GitHub Actions redeploy. Verified via error_rate < 0.01 for 60s.

## SLA impact
Duration: **3m 42s**. Cost per minute per \`sla.md\`: **€150**. Total impact: **€555**. Within monthly error budget (0.1%).

## Evidence & citations
- \`runbooks/RB-01-config-regression.md\` — §3 Standard remediation: *"config regressions: revert the offending commit; do not hotfix under incident."*
- \`incidents/INC-2025-014.md\` — §Root cause: identical port-misconfiguration pattern, same runbook applied.
- \`sla.md\` — §Checkout availability: 99.9% target, €150/min downtime cost.

## Follow-ups
1. Add a startup smoke test in \`shop/\` that fails fast if \`INVENTORY_SERVICE_URL\` is not reachable.
2. Add pre-merge check flagging config diffs to \`settings.py\` for a second reviewer.

_Report signed (Ed25519) — tamper-proof audit trail._
`;

// Scripted timeline. Timestamps are added at runtime.
export interface ScriptStep {
  delay: number;
  event: Omit<TimelineEvent, "id" | "ts">;
  phase?: Phase;
  metrics?: Partial<Metrics>;
  ring?: boolean;
}

export const SCRIPT: ScriptStep[] = [
  {
    delay: 0,
    phase: "alert",
    metrics: { error_rate: 0.41, p95_ms: 2200, rps: 62, green: false },
    event: {
      type: "alert",
      title: "Grafana alert fired — error_rate_high on shop",
      body: "POST /brain/webhook/alert",
      meta: { service: "shop", error_rate: "0.41", p95_ms: "2200 ms" },
    },
  },
  {
    delay: 900,
    phase: "investigating",
    event: {
      type: "plan",
      title: "Plan",
      body: "1. read metrics · 2. pull logs · 3. correlate with recent commits · 4. retrieve similar past incidents · 5. retrieve matching runbook · 6. check SLA · 7. propose action",
    },
  },
  {
    delay: 900,
    event: {
      type: "tool_call",
      title: "get_metrics",
      tool: "get_metrics",
      args: { window_min: 10 },
    },
  },
  {
    delay: 700,
    event: {
      type: "tool_result",
      title: "get_metrics → 200",
      result: "error_rate=0.41 (baseline 0.008) · p95=2200ms · 5xx=873/2130 last 60s",
    },
  },
  {
    delay: 500,
    event: {
      type: "tool_call",
      title: "get_logs",
      tool: "get_logs",
      args: { service: "shop", lines: 50 },
    },
  },
  {
    delay: 800,
    event: {
      type: "tool_result",
      title: "get_logs → 50 lines",
      result: `ConnectionError: HTTPConnectionPool(host='localhost', port=9999): Max retries exceeded
  at shop/checkout.py:reserve_stock  (repeated 47×)`,
    },
  },
  {
    delay: 500,
    event: {
      type: "tool_call",
      title: "get_git_history",
      tool: "get_git_history",
      args: { n: 10 },
    },
  },
  {
    delay: 700,
    event: {
      type: "tool_result",
      title: "get_git_history → 10 commits",
      result: `abc123  p1   16:00:42  shop/settings.py     INVENTORY_SERVICE_URL: 8000 → 9999
b21c4a  p3   15:44:11  docs/README.md       typos
7ee109  p2   15:12:03  grafana/dashboard.json  panel tweak`,
    },
  },
  {
    delay: 500,
    event: {
      type: "tool_call",
      title: "retrieve_docs",
      tool: "retrieve_docs",
      args: { query: "checkout 500 inventory unreachable after config change", k: 3 },
    },
  },
  {
    delay: 900,
    event: {
      type: "retrieval",
      title: "3 documents retrieved (VultronRetriever, cosine)",
      citations: [
        {
          doc: "runbooks/RB-01-config-regression.md",
          section: "3. Standard remediation",
          snippet: "Config regressions: revert the offending commit; do not hotfix under incident. Verify error_rate returns below 0.01 within 90 seconds of redeploy.",
          score: 0.87,
        },
        {
          doc: "incidents/INC-2025-014.md",
          section: "Root cause",
          snippet: "A configuration commit pointed INVENTORY_SERVICE_URL to a port with no listener. Symptoms and remediation identical to current incident.",
          score: 0.81,
        },
        {
          doc: "sla.md",
          section: "Checkout availability",
          snippet: "Checkout availability target 99.9%. Downtime cost: €150/min. On-call must be notified within 60s of a P1 alert.",
          score: 0.74,
        },
      ],
    },
  },
  {
    delay: 900,
    phase: "deciding",
    event: {
      type: "decision",
      title: "Decision — revert (confidence 0.92)",
      body: "Commit abc123 changed INVENTORY_SERVICE_URL to dead port :9999; checkout cannot reserve stock. Logs, git diff and INC-2025-014 all point to the same cause.",
      meta: {
        action: "revert",
        bad_commit: "abc123",
        confidence: "0.92",
        "€/min": "150",
        requires_approval: "true",
      },
    },
  },
  {
    delay: 700,
    phase: "calling",
    event: {
      type: "calling",
      title: "Placing outbound call to on-call — Gradium TTS · Twilio",
      body: "Brief generated (54 words, fr). Dialing +33 ● ● ●…",
    },
  },
  {
    delay: 1200,
    phase: "ringing",
    ring: true,
    event: {
      type: "calling",
      title: "☎ Phone ringing",
      body: "Waiting for spoken approval — GO · ROLLBACK · WAIT",
    },
  },
];

export const AFTER_APPROVAL: ScriptStep[] = [
  {
    delay: 0,
    phase: "fixing",
    event: {
      type: "approval",
      title: "Approval received — human said \"GO\"",
      body: "channel=phone · transcript=\"ouais vas-y go\" · normalized=go",
    },
  },
  {
    delay: 500,
    event: {
      type: "tool_call",
      title: "apply_fix",
      tool: "apply_fix",
      args: { action: "revert", commit: "abc123" },
    },
  },
  {
    delay: 900,
    event: {
      type: "fixing",
      title: "git revert abc123 → push origin main",
      result: "new commit 9f8e7d · GitHub Actions triggered",
    },
  },
  {
    delay: 1800,
    phase: "verifying",
    event: {
      type: "fixing",
      title: "CI/CD deploying · docker compose up -d --build shop",
      body: "target: push→live < 90s",
    },
  },
  {
    delay: 1500,
    event: {
      type: "tool_call",
      title: "verify_recovery",
      tool: "verify_recovery",
      args: {},
    },
  },
  {
    delay: 1200,
    phase: "resolved",
    metrics: { error_rate: 0.005, p95_ms: 180, rps: 65, green: true },
    event: {
      type: "verifying",
      title: "verify_recovery → 200",
      result: "error_rate=0.005 (baseline restored) · p95=180ms · 60s clean window",
    },
  },
  {
    delay: 600,
    event: {
      type: "resolved",
      title: "✅ Incident resolved — 0 humans at a keyboard",
      body: "Duration 3m 42s · SLA impact €555 · audit trail written to audit/inc-20260704-001.jsonl",
    },
  },
  {
    delay: 700,
    event: {
      type: "postmortem",
      title: "Post-mortem generated & committed",
      body: "docs/postmortems/inc-20260704-001.md · Ed25519-signed",
    },
  },
];
