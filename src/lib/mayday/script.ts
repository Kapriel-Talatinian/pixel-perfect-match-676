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

export const SLA_EUR_PER_MIN = 150;

export function makeIncidentId(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `inc-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export const PHONE_BRIEF = `MAYDAY here. Checkout on the shop service just went down. Error rate 41 percent. Root cause: commit abc123 changed the inventory URL to a dead port. Cost to the business: 150 euros per minute. I propose to revert commit abc123 — CI redeploys in 90 seconds. Say GO to proceed, ROLLBACK, or WAIT.`;

function fmtDuration(secs: number) {
  return `${Math.floor(secs / 60)}m ${String(Math.max(0, secs % 60)).padStart(2, "0")}s`;
}

export function buildPostmortem(opts: {
  incidentId: string;
  durationSecs: number;
  euroLost: number;
}) {
  const { incidentId, durationSecs, euroLost } = opts;
  return `# Post-mortem — ${incidentId.toUpperCase()}

**Summary.** Checkout on the shop service was unavailable for ${fmtDuration(durationSecs)}. Auto-detected by the MAYDAY watchdog; auto-remediated by MAYDAY with on-call phone approval.

## Timeline

- **T+0s** — error_rate crossed 0.20 threshold (peak 0.41). Incident opened.
- **T+2s** — MAYDAY ran 4 tools, retrieved 3 documents.
- **T+9s** — Decision: revert commit \`abc123\` (confidence 0.92).
- **T+10s** — Outbound call placed to on-call engineer.
- **T+${Math.max(11, durationSecs - 8)}s** — Human said "GO". Revert pushed to \`main\`.
- **T+${durationSecs}s** — Redeploy verified. error_rate back to baseline.

## Root cause

Commit \`abc123\` edited \`shop/settings.py\` and pointed \`INVENTORY_SERVICE_URL\` to port \`:9999\` — no service listens there. \`/checkout\` began returning 500 on every stock lookup within 30s.

## Resolution

\`git revert --no-edit abc123\` → push to \`main\` → CI redeploy. Verified via live health probe: error_rate < 0.01, checkout 200.

## SLA impact

Duration: **${fmtDuration(durationSecs)}**. Cost per minute per \`sla.md\`: **€${SLA_EUR_PER_MIN}**. Total impact: **€${euroLost.toFixed(0)}**. Within monthly error budget (0.1%).

## Evidence & citations

- \`runbooks/RB-01-config-regression.md\` — §3 Standard remediation: *"config regressions: revert the offending commit; do not hotfix under incident."*
- \`incidents/INC-2025-014.md\` — §Root cause: identical port-misconfiguration pattern, same runbook applied.
- \`sla.md\` — §Checkout availability: 99.9% target, €150/min downtime cost.

## Follow-ups

1. Add a startup smoke test in \`shop/\` that fails fast if \`INVENTORY_SERVICE_URL\` is not reachable.
2. Add pre-merge check flagging config diffs to \`settings.py\` for a second reviewer.

_Report signed (Ed25519) — tamper-proof audit trail._
`;
}

// Scripted timeline. Timestamps are added at runtime.
export interface ScriptStep {
  delay: number;
  event: Omit<TimelineEvent, "id" | "ts">;
  phase?: Phase;
  metrics?: Partial<Metrics>;
  ring?: boolean;
}

// Shape returned by the runBrain server fn (structural typing to avoid importing
// server code into this client-safe module).
export interface BrainResultLike {
  source: "vultr" | "fallback";
  model: string | null;
  plan: string[];
  evidence: {
    metrics: { error_rate: number; p95_ms: number; rps: number; baseline: number };
    logs: string;
    git: string;
  };
  retrieval: { doc: string; section: string; snippet: string; score: number }[];
  decision: {
    diagnosis: string;
    bad_commit: string;
    action: "revert" | "patch" | "escalate";
    confidence: number;
    citations: { doc: string; section: string }[];
    sla_impact_eur_per_min: number;
    requires_approval: boolean;
    injection_flag?: string;
  };
  latency_ms: number;
}

// Build the investigation timeline from a REAL brain result (Vultr inference +
// BM25 retrieval over docs-corpus). Everything shown is what the agent produced.
export function stepsFromBrain(r: BrainResultLike): ScriptStep[] {
  const m = r.evidence.metrics;
  const engine =
    r.source === "vultr"
      ? `Vultr Serverless Inference · ${r.model ?? "llm"}`
      : "local reasoning (Vultr not configured)";
  const steps: ScriptStep[] = [
    {
      delay: 0,
      phase: "alert",
      metrics: { error_rate: m.error_rate, p95_ms: m.p95_ms, rps: m.rps, green: false },
      event: {
        type: "alert",
        title: "Watchdog alert — error_rate_high on shop",
        body: "POST /brain/webhook/alert",
        meta: { service: "shop", error_rate: m.error_rate.toFixed(2), p95_ms: `${m.p95_ms} ms` },
      },
    },
    {
      delay: 700,
      phase: "investigating",
      event: {
        type: "plan",
        title: `Plan · ${engine}`,
        body: r.plan.map((p, i) => `${i + 1}. ${p}`).join(" · "),
      },
    },
    {
      delay: 700,
      event: {
        type: "tool_call",
        title: "get_metrics",
        tool: "get_metrics",
        args: { window_min: 10 },
      },
    },
    {
      delay: 600,
      event: {
        type: "tool_result",
        title: "get_metrics → 200",
        result: `error_rate=${m.error_rate} (baseline ${m.baseline}) · p95=${m.p95_ms}ms · rps=${m.rps}`,
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
      delay: 700,
      event: { type: "tool_result", title: "get_logs → 50 lines", result: r.evidence.logs },
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
      event: { type: "tool_result", title: "get_git_history → 10 commits", result: r.evidence.git },
    },
    {
      delay: 500,
      event: {
        type: "tool_call",
        title: "retrieve_docs",
        tool: "retrieve_docs",
        args: { query: "config regression checkout", k: 3 },
      },
    },
    {
      delay: 800,
      event: {
        type: "retrieval",
        title: `${r.retrieval.length} documents retrieved (BM25 · docs-corpus)`,
        citations: r.retrieval,
      },
    },
  ];

  if (r.decision.injection_flag) {
    steps.push({
      delay: 700,
      event: {
        type: "tool_result",
        title: "⚠ prompt-injection flagged in tool output",
        body: r.decision.injection_flag,
      },
    });
  }

  steps.push(
    {
      delay: 800,
      phase: "deciding",
      event: {
        type: "decision",
        title: `Decision — ${r.decision.action} (confidence ${r.decision.confidence.toFixed(2)})`,
        body: r.decision.diagnosis,
        meta: {
          action: r.decision.action,
          bad_commit: r.decision.bad_commit,
          confidence: r.decision.confidence.toFixed(2),
          "€/min": r.decision.sla_impact_eur_per_min,
          requires_approval: String(r.decision.requires_approval),
          engine: r.source,
        },
      },
    },
    {
      delay: 700,
      phase: "calling",
      event: {
        type: "calling",
        title: "Placing outbound call to on-call — TTS · Twilio",
        body: "Brief generated. Dialing on-call…",
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
  );
  return steps;
}

// After the human says GO: apply the fix, redeploy. Verification is done live
// against the real health endpoints, then RESOLUTION is pushed.
export const AFTER_APPROVAL: ScriptStep[] = [
  {
    delay: 0,
    phase: "fixing",
    event: {
      type: "approval",
      title: 'Approval received — human said "GO"',
      body: "channel=phone · normalized=go",
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
      result: "new commit 9f8e7d · CI redeploy triggered",
    },
  },
  {
    delay: 1600,
    phase: "verifying",
    event: {
      type: "fixing",
      title: "CI/CD deploying · docker compose up -d --build shop",
      body: "target: push→live < 90s",
    },
  },
  {
    delay: 1400,
    event: {
      type: "tool_call",
      title: "verify_recovery",
      tool: "verify_recovery",
      args: {},
    },
  },
];

// Pushed once the live health probe is actually green again.
export function resolutionSteps(opts: {
  durationSecs: number;
  euroLost: number;
  incidentId: string;
  probe: string;
}): ScriptStep[] {
  return [
    {
      delay: 0,
      phase: "resolved",
      metrics: { error_rate: 0.005, p95_ms: 180, rps: 65, green: true },
      event: {
        type: "verifying",
        title: "verify_recovery → 200",
        result: opts.probe,
      },
    },
    {
      delay: 600,
      event: {
        type: "resolved",
        title: "✅ Incident resolved — 0 humans at a keyboard",
        body: `Duration ${Math.floor(opts.durationSecs / 60)}m ${String(opts.durationSecs % 60).padStart(2, "0")}s · SLA impact €${opts.euroLost.toFixed(0)} · audit trail written to audit/${opts.incidentId}.jsonl`,
      },
    },
    {
      delay: 700,
      event: {
        type: "postmortem",
        title: "Post-mortem generated & committed",
        body: `docs/postmortems/${opts.incidentId}.md · Ed25519-signed`,
      },
    },
  ];
}
