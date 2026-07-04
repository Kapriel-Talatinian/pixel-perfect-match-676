import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Zap, RotateCcw, Phone, PhoneCall, PhoneIncoming, Mic, FileText, Radio, Wifi,
  AlertTriangle, CheckCircle2, ShieldCheck, Store, Activity, ArrowUpRight,
} from "lucide-react";
import {
  AFTER_APPROVAL,
  INCIDENT_ID,
  PHONE_BRIEF,
  POSTMORTEM,
  SCRIPT,
  type Metrics,
  type Phase,
  type ScriptStep,
  type TimelineEvent,
} from "@/lib/mayday/script";
import { getIncidentDecision, startMaydayCall } from "@/lib/mayday/call.functions";

const GREEN_METRICS: Metrics = { error_rate: 0.006, p95_ms: 168, rps: 58, green: true };

function nowIso() {
  return new Date().toISOString().slice(11, 19);
}

function typeColor(t: TimelineEvent["type"]) {
  switch (t) {
    case "alert": return "text-danger";
    case "plan": return "text-neon";
    case "tool_call": return "text-warning";
    case "tool_result": return "text-muted-foreground";
    case "retrieval": return "text-neon";
    case "decision": return "text-success";
    case "calling": return "text-warning";
    case "approval": return "text-success";
    case "fixing": return "text-warning";
    case "verifying": return "text-neon";
    case "resolved": return "text-success";
    case "postmortem": return "text-success";
  }
}

function typeLabel(t: TimelineEvent["type"]) {
  return t.replace("_", " ").toUpperCase();
}

export function MaydayConsole() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(GREEN_METRICS);
  const [ringing, setRinging] = useState(false);
  const [euroLost, setEuroLost] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [resolvedAt, setResolvedAt] = useState<number | null>(null);
  const [showPostmortem, setShowPostmortem] = useState(false);
  const [callAnswered, setCallAnswered] = useState(false);
  const [briefIndex, setBriefIndex] = useState(0);

  // --- REAL Twilio call state ---
  const [toNumber, setToNumber] = useState<string>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.to")) || "");
  const [fromNumber, setFromNumber] = useState<string>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.from")) || "");
  const [realCallEnabled, setRealCallEnabled] = useState<boolean>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.real") === "1") || false);
  const [callStatus, setCallStatus] = useState<string>("");
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [watchShop, setWatchShop] = useState<boolean>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.watch") === "1") || false);
  const [remoteShopUrl, setRemoteShopUrl] = useState<string>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.remote")) || "http://192.248.185.175");
  const [remoteShopToken, setRemoteShopToken] = useState<string>(() => (typeof window !== "undefined" && localStorage.getItem("mayday.remoteToken")) || "");
  const [remoteStatus, setRemoteStatus] = useState<string>("");
  const [remoteBusy, setRemoteBusy] = useState<null | "break" | "repair">(null);

  const timeoutsRef = useRef<number[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.to", toNumber); }, [toNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.from", fromNumber); }, [fromNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.real", realCallEnabled ? "1" : "0"); }, [realCallEnabled]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.watch", watchShop ? "1" : "0"); }, [watchShop]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.remote", remoteShopUrl); }, [remoteShopUrl]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.remoteToken", remoteShopToken); }, [remoteShopToken]);

  const startCall = useServerFn(startMaydayCall);
  const pollDecision = useServerFn(getIncidentDecision);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events.length]);

  // €-counter tick
  useEffect(() => {
    if (runStartedAt === null || resolvedAt !== null) return;
    const id = window.setInterval(() => {
      const secs = (Date.now() - runStartedAt) / 1000;
      setEuroLost(Math.floor((150 / 60) * secs * 10) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [runStartedAt, resolvedAt]);

  // Type-out the phone brief while ringing/answered
  useEffect(() => {
    if (!callAnswered) return;
    if (briefIndex >= PHONE_BRIEF.length) return;
    const id = window.setTimeout(() => setBriefIndex((i) => Math.min(i + 2, PHONE_BRIEF.length)), 28);
    return () => clearTimeout(id);
  }, [callAnswered, briefIndex]);

  const pushStep = useCallback((step: ScriptStep) => {
    if (step.phase) setPhase(step.phase);
    if (step.metrics) setMetrics((m) => ({ ...m, ...step.metrics }));
    if (step.ring !== undefined) setRinging(step.ring);
    const evt: TimelineEvent = {
      ...step.event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: nowIso(),
    };
    setEvents((prev) => [...prev, evt]);
  }, []);

  const runScript = useCallback((steps: ScriptStep[], onDone?: () => void) => {
    let acc = 0;
    steps.forEach((step) => {
      acc += step.delay;
      const id = window.setTimeout(() => pushStep(step), acc);
      timeoutsRef.current.push(id);
    });
    if (onDone) {
      const id = window.setTimeout(onDone, acc + 200);
      timeoutsRef.current.push(id);
    }
  }, [pushStep]);

  const breakProduction = useCallback(() => {
    clearTimers();
    setEvents([]);
    setRinging(false);
    setShowPostmortem(false);
    setCallAnswered(false);
    setBriefIndex(0);
    setResolvedAt(null);
    setEuroLost(0);
    setRunStartedAt(Date.now());
    setPhase("alert");
    setIncidentId(null);
    setCallStatus("");
    runScript(SCRIPT, () => setPhase("awaiting_approval"));
  }, [clearTimers, runScript]);

  const answerCall = useCallback(() => {
    if (!ringing) return;
    setCallAnswered(true);
    setBriefIndex(0);
  }, [ringing]);

  const decide = useCallback((choice: "go" | "rollback" | "wait") => {
    if (phase !== "awaiting_approval" && phase !== "ringing") return;
    if (choice === "wait") {
      setRinging(false);
      setCallAnswered(false);
      setPhase("awaiting_approval");
      setEvents((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          ts: nowIso(),
          type: "approval",
          title: "Human said \"WAIT\" — holding",
          body: "MAYDAY will re-ask in 60s or on human input.",
        },
      ]);
      return;
    }
    if (choice === "rollback") {
      setRinging(false);
      setCallAnswered(false);
      setPhase("rejected");
      setEvents((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          ts: nowIso(),
          type: "approval",
          title: "Human said \"ROLLBACK\" — escalating to on-call team",
          body: "MAYDAY stands down. Human takes the wheel.",
        },
      ]);
      return;
    }
    // GO
    setRinging(false);
    runScript(AFTER_APPROVAL, () => {
      setResolvedAt(Date.now());
      setPhase("resolved");
    });
  }, [phase, runScript]);

  const reset = useCallback(() => {
    clearTimers();
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    setEvents([]);
    setMetrics(GREEN_METRICS);
    setRinging(false);
    setEuroLost(0);
    setRunStartedAt(null);
    setResolvedAt(null);
    setShowPostmortem(false);
    setCallAnswered(false);
    setBriefIndex(0);
    setPhase("idle");
    setIncidentId(null);
    setCallStatus("");
  }, [clearTimers]);

  // Trigger real Twilio call the moment the script starts ringing
  useEffect(() => {
    if (!ringing || !realCallEnabled || incidentId) return;
    if (!toNumber || !fromNumber) {
      setCallStatus("Enter your phone + Twilio From number to enable real call");
      return;
    }
    setCallStatus("Placing Twilio call…");
    startCall({ data: { to: toNumber, from: fromNumber, brief: PHONE_BRIEF } })
      .then((r) => {
        setIncidentId(r.id);
        setCallStatus(`Ringing ${toNumber} · SID ${(r.callSid ?? "").slice(-6) || "?"}`);
      })
      .catch((e: unknown) => setCallStatus(`Call failed: ${(e as Error)?.message ?? "call failed"}`));
  }, [ringing, realCallEnabled, toNumber, fromNumber, incidentId, startCall]);

  // Poll for the caller's DTMF decision, mirror it into the UI
  useEffect(() => {
    if (!incidentId) return;
    if (phase === "resolved" || phase === "rejected" || phase === "idle") return;
    const id = window.setInterval(async () => {
      try {
        const r = await pollDecision({ data: { id: incidentId } });
        if (r.decision) {
          window.clearInterval(id);
          pollRef.current = null;
          setCallStatus(`Phone reply: ${r.decision.toUpperCase()}`);
          if (!callAnswered) setCallAnswered(true);
          decide(r.decision);
        }
      } catch { /* keep polling */ }
    }, 1500);
    pollRef.current = id;
    return () => { window.clearInterval(id); pollRef.current = null; };
  }, [incidentId, phase, pollDecision, decide, callAnswered]);

  // Watchdog: poll internal /api/shop/health AND remote shop via server-side proxy
  useEffect(() => {
    if (!watchShop) return;
    const canTrigger = () => phase === "idle" || phase === "resolved" || phase === "rejected";
    const tick = async () => {
      let broken = false;
      let reason = "";
      // internal demo shop
      try {
        const r = await fetch("/api/shop/health", { cache: "no-store" });
        const h = await r.json();
        if (h.broken) { broken = true; reason = `internal shop · ${h.reason}`; }
      } catch { /* ignore */ }
      // remote real shop (via proxy, no CORS issues)
      if (remoteShopUrl.trim()) {
        try {
          const r = await fetch(`/api/vultr-shop/health?url=${encodeURIComponent(remoteShopUrl.trim())}`, { cache: "no-store" });
          const h = await r.json();
          setRemoteStatus(h.ok ? `remote OK · ${h.latency_ms}ms` : `remote DOWN · ${h.reason ?? "?"}`);
          if (h.broken && !broken) { broken = true; reason = `remote shop · ${h.reason}`; }
        } catch (e) {
          setRemoteStatus(`remote error · ${(e as Error).message}`);
        }
      } else {
        setRemoteStatus("");
      }
      if (broken && canTrigger()) {
        setCallStatus(reason);
        breakProduction();
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchShop, phase, remoteShopUrl]);



  const canBreak = phase === "idle" || phase === "resolved" || phase === "rejected";
  const isBroken = !metrics.green;
  const durationSecs = useMemo(() => {
    if (runStartedAt === null) return 0;
    const end = resolvedAt ?? Date.now();
    return Math.floor((end - runStartedAt) / 1000);
  }, [runStartedAt, resolvedAt, euroLost]);

  return (
    <div className="min-h-screen text-foreground">
      <TopBar phase={phase} isBroken={isBroken} />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <TwilioSettings
          toNumber={toNumber}
          setToNumber={setToNumber}
          fromNumber={fromNumber}
          setFromNumber={setFromNumber}
          realCallEnabled={realCallEnabled}
          setRealCallEnabled={setRealCallEnabled}
          callStatus={callStatus}
          watchShop={watchShop}
          setWatchShop={setWatchShop}
        />
        <RemoteShopBar
          url={remoteShopUrl}
          setUrl={setRemoteShopUrl}
          token={remoteShopToken}
          setToken={setRemoteShopToken}
          status={remoteStatus}
          watching={watchShop}
          busy={remoteBusy}
          onAction={async (action) => {
            if (!remoteShopUrl.trim()) return;
            setRemoteBusy(action);
            try {
              const r = await fetch("/api/vultr-shop/break", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: remoteShopUrl.trim(), action, token: remoteShopToken.trim() || undefined }),
              });
              const j = await r.json();
              setRemoteStatus(j.ok ? `remote ${action} OK · ${j.latency_ms}ms` : `remote ${action} FAIL · ${j.error ?? j.upstream_status ?? "?"}`);
            } catch (e) {
              setRemoteStatus(`remote ${action} error · ${(e as Error).message}`);
            } finally {
              setRemoteBusy(null);
            }
          }}
        />
        <div className="mt-4">
          <PhonePanel
            ringing={ringing}
            phase={phase}
            callAnswered={callAnswered}
            briefText={PHONE_BRIEF.slice(0, briefIndex)}
            briefDone={callAnswered && briefIndex >= PHONE_BRIEF.length}
            onAnswer={answerCall}
            onDecide={decide}
            realCallEnabled={realCallEnabled}
            callStatus={callStatus}
          />
        </div>
      </main>
    </div>
  );
}

function TopBar({ phase, isBroken }: { phase: Phase; isBroken: boolean }) {
  const statusText: Record<Phase, string> = {
    idle: "Standby",
    alert: "Alert received",
    investigating: "Investigating",
    deciding: "Deciding",
    calling: "Placing call",
    ringing: "Ringing on-call",
    awaiting_approval: "Awaiting approval",
    approved: "Approved",
    rejected: "Human took over",
    fixing: "Applying fix",
    verifying: "Verifying recovery",
    resolved: "Resolved",
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center text-mono text-base font-bold ${isBroken ? "bg-danger text-white glow-red" : "bg-primary text-primary-foreground glow-green"}`}>
          M
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            MAYDAY · call bridge
          </div>
          <h1 className="truncate text-base font-bold">{statusText[phase]}</h1>
        </div>
        {phase !== "idle" && (
          <span className="text-mono text-[10px] text-muted-foreground">{INCIDENT_ID}</span>
        )}
      </div>
    </header>
  );
}

function _LegacyTopBar({
  phase,
  isBroken,
  euroLost,
  durationSecs,
  onBreak,
  onReset,
  canBreak,
}: {
  phase: Phase;
  isBroken: boolean;
  euroLost: number;
  durationSecs: number;
  onBreak: () => void;
  onReset: () => void;
  canBreak: boolean;
}) {
  const statusText: Record<Phase, string> = {
    idle: "All systems green",
    alert: "Alert received",
    investigating: "Investigating",
    deciding: "Deciding",
    calling: "Placing call",
    ringing: "Ringing on-call",
    awaiting_approval: "Awaiting approval",
    approved: "Approved",
    rejected: "Human took over",
    fixing: "Applying fix",
    verifying: "Verifying recovery",
    resolved: "Resolved",
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center text-mono text-lg font-bold ${isBroken ? "bg-danger text-white glow-red" : "bg-primary text-primary-foreground glow-green"}`}>
            M
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              MAYDAY <span className="text-neon">v2</span>
              <span className="hidden text-muted-foreground/60 sm:inline">· autonomous incident response</span>
            </div>
            <h1 className="truncate text-lg font-bold sm:text-xl">
              {statusText[phase]}
              {phase !== "idle" && (
                <span className="ml-2 text-mono text-[11px] font-normal text-muted-foreground">
                  {INCIDENT_ID}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className={`panel px-3 py-2 text-mono text-xs ${isBroken ? "text-danger" : "text-muted-foreground"}`}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">€ lost</div>
            <div className={`text-lg font-bold tabular-nums ${isBroken && phase !== "resolved" ? "text-danger" : "text-foreground"}`}>
              €{euroLost.toFixed(1)}
            </div>
          </div>
          <div className="panel px-3 py-2 text-mono text-xs">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Duration</div>
            <div className="text-lg font-bold tabular-nums">{Math.floor(durationSecs / 60)}m {String(durationSecs % 60).padStart(2, "0")}s</div>
          </div>
          <Link
            to="/shop"
            className="flex items-center gap-1.5 border border-border bg-background/40 px-3 py-2 text-mono text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
          ><Store className="h-3.5 w-3.5" /> Shop <ArrowUpRight className="h-3 w-3" /></Link>
          {canBreak ? (
            <button
              onClick={onBreak}
              className="flex items-center gap-2 bg-danger px-4 py-2 text-sm font-bold text-white shadow-lg shadow-danger/40 transition hover:brightness-110 active:scale-95"
            >
              <Zap className="h-4 w-4" /> Break production
            </button>
          ) : (
            <button
              onClick={onReset}
              className="flex items-center gap-2 border border-border bg-muted px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ShopPanel({ metrics, phase }: { metrics: Metrics; phase: Phase }) {
  const bars = useMemo(() => {
    // 40 bars, animate error_rate over time visually
    const base = metrics.error_rate;
    return Array.from({ length: 40 }).map((_, i) => {
      const jitter = (Math.sin(i * 1.3) + 1) * 0.15;
      const target = base * (0.6 + jitter);
      return Math.min(1, target);
    });
  }, [metrics.error_rate]);

  const isBroken = !metrics.green;

  return (
    <section className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isBroken ? "bg-danger pulse-dot" : "bg-success"}`} />
          <span className="text-mono text-xs uppercase tracking-widest text-muted-foreground">shop</span>
          <span className="text-mono text-xs text-foreground">:8000</span>
        </div>
        <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Grafana</span>
      </div>

      <div className="grid grid-cols-3 gap-2 p-4">
        <Stat label="Error rate" value={`${(metrics.error_rate * 100).toFixed(1)}%`} tone={isBroken ? "danger" : "success"} />
        <Stat label="p95" value={`${metrics.p95_ms}ms`} tone={metrics.p95_ms > 500 ? "warning" : "muted"} />
        <Stat label="RPS" value={`${metrics.rps}`} tone="muted" />
      </div>

      <div className="px-4 pb-4">
        <div className="mb-2 flex items-center justify-between text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>error_rate — last 60s</span>
          <span className={isBroken ? "text-danger" : "text-success"}>
            {isBroken ? "▲ CRITICAL" : "▼ nominal"}
          </span>
        </div>
        <div className={`flex h-24 items-end gap-[3px] rounded-md border p-2 ${isBroken ? "border-danger/40 bg-danger/5" : "border-success/30 bg-success/5"}`}>
          {bars.map((v, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all duration-500 ${isBroken ? "bg-danger" : "bg-success"}`}
              style={{ height: `${Math.max(4, v * 100)}%`, opacity: 0.4 + v * 0.6 }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border/60 p-4">
        <div className="mb-2 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">recent commits</div>
        <ul className="space-y-1.5 text-mono text-xs">
          <li className={`flex items-center gap-2 ${isBroken && phase !== "resolved" ? "text-danger" : "text-muted-foreground"}`}>
            <span className="w-14 shrink-0">abc123</span>
            <span className="truncate">shop/settings.py</span>
            <span className="ml-auto shrink-0 text-[10px]">16:00</span>
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="w-14 shrink-0">b21c4a</span>
            <span className="truncate">docs/README.md</span>
            <span className="ml-auto shrink-0 text-[10px]">15:44</span>
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="w-14 shrink-0">7ee109</span>
            <span className="truncate">grafana/dashboard.json</span>
            <span className="ml-auto shrink-0 text-[10px]">15:12</span>
          </li>
        </ul>
      </div>

      <div className="mt-auto border-t border-border/60 bg-muted/40 px-4 py-3">
        <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">tools available</div>
        <div className="mt-1 flex flex-wrap gap-1 text-mono text-[10px]">
          {["get_metrics", "get_logs", "get_git_history", "retrieve_docs", "request_approval", "apply_fix", "verify_recovery"].map((t) => (
            <span key={t} className="rounded border border-border bg-background/50 px-1.5 py-0.5 text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "warning" | "muted" }) {
  const color = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-2">
      <div className="text-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-mono text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

const AgentTimeline = (function () {
  return function AgentTimelineImpl({
    events,
    phase,
    ref,
  }: {
    events: TimelineEvent[];
    phase: Phase;
    ref: React.RefObject<HTMLDivElement | null>;
  }) {
    return (
      <section className="panel flex min-h-[560px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "idle" || phase === "resolved" ? "bg-success" : "bg-neon pulse-dot"}`} />
            <span className="text-mono text-xs uppercase tracking-widest text-muted-foreground">brain</span>
            <span className="text-mono text-xs">:8100</span>
            <span className="ml-2 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">agent loop · SSE stream</span>
          </div>
          <span className="text-mono text-[10px] text-muted-foreground">Vultr Serverless Inference · LiteLLM</span>
        </div>

        <div ref={ref} className="flex-1 overflow-y-auto scan-lines px-4 py-4">
          {events.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="space-y-3">
              {events.map((e) => (
                <TimelineItem key={e.id} event={e} />
              ))}
              {phase !== "idle" && phase !== "resolved" && phase !== "rejected" && (
                <li className="flex items-center gap-2 text-mono text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-neon pulse-dot" />
                  thinking<span className="caret-blink">…</span>
                </li>
              )}
            </ol>
          )}
        </div>
      </section>
    );
  };
})();

function EmptyState() {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm">
        <div className="text-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">MAYDAY console</div>
        <h2 className="mt-2 text-2xl font-bold">Your infrastructure just called.<br /><span className="text-primary">It fixed itself.</span></h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Hit <span className="text-mono text-danger">Break production</span> to trigger a real config regression on the shop service. Watch the agent plan, call 7 tools, retrieve 3 documents, then phone the on-call human for approval.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <div className="rounded border border-border/60 py-2">detect</div>
          <div className="rounded border border-border/60 py-2">decide</div>
          <div className="rounded border border-border/60 py-2">call</div>
          <div className="rounded border border-border/60 py-2">approve</div>
          <div className="rounded border border-border/60 py-2">fix</div>
          <div className="rounded border border-border/60 py-2">verify</div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ event: e }: { event: TimelineEvent }) {
  return (
    <li className="group">
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0 pt-0.5 text-mono text-[10px] tabular-nums text-muted-foreground">{e.ts}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`text-mono text-[10px] font-bold uppercase tracking-widest ${typeColor(e.type)}`}>
              {typeLabel(e.type)}
            </span>
            <span className="text-sm font-semibold">{e.title}</span>
          </div>
          {e.body && (
            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{e.body}</p>
          )}
          {e.meta && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Object.entries(e.meta).map(([k, v]) => (
                <span key={k} className="rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-mono text-[10px]">
                  <span className="text-muted-foreground">{k}=</span>
                  <span className="text-foreground">{v}</span>
                </span>
              ))}
            </div>
          )}
          {e.tool && (
            <div className="mt-1 rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-mono text-xs">
              <span className="text-warning">→ {e.tool}</span>
              <span className="text-muted-foreground">({JSON.stringify(e.args ?? {}).slice(1, -1) || "…"})</span>
            </div>
          )}
          {e.result && (
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-border/60 bg-background/60 px-2.5 py-2 text-mono text-[11px] leading-relaxed text-muted-foreground">
              {e.result}
            </pre>
          )}
          {e.citations && (
            <div className="mt-2 space-y-1.5">
              {e.citations.map((c, i) => (
                <div key={i} className="rounded-md border border-neon/30 bg-neon/[0.04] px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-mono text-[10px]">
                    <div className="min-w-0 truncate">
                      <span className="text-neon">{c.doc}</span>
                      <span className="text-muted-foreground"> § {c.section}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">score {c.score.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-xs italic text-muted-foreground">“{c.snippet}”</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function PhonePanel({
  ringing,
  phase,
  callAnswered,
  briefText,
  briefDone,
  onAnswer,
  onDecide,
  realCallEnabled,
  callStatus,
}: {
  ringing: boolean;
  phase: Phase;
  callAnswered: boolean;
  briefText: string;
  briefDone: boolean;
  onAnswer: () => void;
  onDecide: (choice: "go" | "rollback" | "wait") => void;
  realCallEnabled: boolean;
  callStatus: string;
}) {
  const canDecide = callAnswered && briefDone;

  return (
    <section className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 ${ringing ? "bg-warning pulse-dot" : callAnswered ? "bg-success" : "bg-muted-foreground/40"}`} />
          <span className="text-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">voice</span>
          <span className="text-mono text-[11px] text-foreground">:8300</span>
        </div>
        <div className="flex items-center gap-1.5 text-mono text-[10px] uppercase tracking-widest">
          <Radio className={`h-3 w-3 ${realCallEnabled ? "text-primary" : "text-muted-foreground"}`} />
          <span className={realCallEnabled ? "text-primary" : "text-muted-foreground"}>
            {realCallEnabled ? "LIVE · Twilio" : "Simulation"}
          </span>
        </div>
      </div>
      {callStatus && (
        <div className="border-b border-border/60 bg-background/40 px-4 py-2 text-mono text-[11px] text-foreground">
          {callStatus}
        </div>
      )}

      {/* Call header — sharp, no round avatar */}
      <div className="border-b border-border/60 bg-gradient-to-b from-background/20 to-transparent px-5 py-5">
        <div className="flex items-start gap-4">
          <div className={`relative grid h-14 w-14 shrink-0 place-items-center border ${
            ringing ? "border-warning bg-warning/10" :
            callAnswered ? "border-success bg-success/10" :
            "border-border bg-background/40"
          }`}>
            {ringing && <span className="absolute inset-0 animate-ping bg-warning/25" />}
            {callAnswered ? (
              <PhoneCall className="h-6 w-6 text-success" />
            ) : ringing ? (
              <PhoneIncoming className={`h-6 w-6 text-warning ${ringing ? "ring-shake" : ""}`} />
            ) : (
              <Phone className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <Wifi className="h-3 w-3" /> Incoming · MAYDAY
            </div>
            <div className="mt-0.5 text-mono text-base font-bold tabular-nums text-foreground">+33 6 ●● ●● ●● 44</div>
            <div className="mt-1 text-mono text-[11px] text-muted-foreground">
              {phase === "idle" && "Standing by"}
              {phase === "alert" && "—"}
              {(phase === "investigating" || phase === "deciding") && "not called yet"}
              {phase === "calling" && "dialing…"}
              {phase === "ringing" && !callAnswered && "ringing · tap to answer"}
              {callAnswered && !briefDone && "MAYDAY speaking…"}
              {callAnswered && briefDone && "awaiting your reply"}
              {phase === "fixing" && "call ended · GO received"}
              {phase === "verifying" && "call ended · GO received"}
              {phase === "resolved" && "call ended · resolved"}
              {phase === "rejected" && "call ended · human took over"}
            </div>
          </div>
        </div>

        {ringing && !callAnswered && (
          <button
            onClick={onAnswer}
            className="mt-4 flex w-full items-center justify-center gap-2 bg-warning px-4 py-3 text-sm font-bold text-background transition hover:brightness-110 active:scale-95"
          >
            <PhoneCall className="h-4 w-4" /> Answer call
          </button>
        )}
      </div>

      {callAnswered && (
        <div className="border-b border-border/60 px-5 py-4">
          <div className="mb-2 flex items-center justify-between text-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mic className="h-3 w-3 text-primary" /> MAYDAY briefing</span>
            <span className="text-neon">fr · Gradium TTS</span>
          </div>
          <p className="text-[13px] leading-relaxed text-foreground">
            {briefText}
            {!briefDone && <span className="caret-blink text-primary">▊</span>}
          </p>
        </div>
      )}

      {canDecide && (
        <div className="space-y-2.5 px-5 py-4">
          <div className="text-center text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Your reply · STT</div>
          <button
            onClick={() => onDecide("go")}
            className="flex w-full items-center justify-center gap-2 bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 active:scale-95 glow-green"
          >
            <Mic className="h-4 w-4" /> Say "GO"
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onDecide("rollback")}
              className="flex items-center justify-center gap-2 border border-danger/50 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger/20"
            ><AlertTriangle className="h-3.5 w-3.5" /> ROLLBACK</button>
            <button
              onClick={() => onDecide("wait")}
              className="border border-border bg-muted px-3 py-2.5 text-sm font-semibold hover:bg-secondary"
            >WAIT</button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground">
            Unclear reply → voice re-asks once → else "wait"
          </p>
        </div>
      )}

      <div className="mt-auto border-t border-border/60 bg-muted/40 px-4 py-3">
        <div className="grid grid-cols-2 gap-2 text-mono text-[10px]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-primary" />
            <div>
              <div className="uppercase tracking-widest text-muted-foreground">safety</div>
              <div className="text-foreground">approval-gated</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            <div>
              <div className="uppercase tracking-widest text-muted-foreground">audit</div>
              <div className="text-foreground">Ed25519-signed</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PostmortemPanel({
  open,
  setOpen,
  durationSecs,
  euroLost,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  durationSecs: number;
  euroLost: number;
}) {
  return (
    <section className="panel mt-4 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-border/60 bg-success/5 px-4 py-3 text-left transition hover:bg-success/10"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <div className="text-mono text-[10px] uppercase tracking-widest text-success">post-mortem · committed</div>
            <div className="truncate text-base font-bold">docs/postmortems/{INCIDENT_ID}.md</div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-mono text-xs sm:flex">
          <span><span className="text-muted-foreground">duration </span>{Math.floor(durationSecs / 60)}m {String(durationSecs % 60).padStart(2, "0")}s</span>
          <span><span className="text-muted-foreground">saved after </span>€{euroLost.toFixed(0)}</span>
          <span className="text-primary">{open ? "▲ collapse" : "▼ expand"}</span>
        </div>
      </button>
      {open && (
        <article className="prose prose-invert max-w-none px-6 py-5 text-sm">
          <MarkdownLite source={POSTMORTEM} />
        </article>
      )}
    </section>
  );
}

// Minimal, safe markdown-ish renderer for the post-mortem
function MarkdownLite({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/);
  return (
    <div className="space-y-3 text-foreground">
      {blocks.map((b, i) => {
        if (b.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold">{b.slice(2)}</h1>;
        if (b.startsWith("## ")) return <h2 key={i} className="mt-4 text-lg font-bold text-primary">{b.slice(3)}</h2>;
        if (b.startsWith("- ")) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6 text-sm">
              {b.split("\n").map((line, j) => (
                <li key={j}><Inline text={line.replace(/^- /, "")} /></li>
              ))}
            </ul>
          );
        }
        if (/^\d+\.\s/.test(b)) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-6 text-sm">
              {b.split("\n").map((line, j) => (
                <li key={j}><Inline text={line.replace(/^\d+\.\s/, "")} /></li>
              ))}
            </ol>
          );
        }
        if (b.startsWith("_") && b.endsWith("_")) {
          return <p key={i} className="text-xs italic text-muted-foreground">{b.slice(1, -1)}</p>;
        }
        return <p key={i} className="text-sm leading-relaxed"><Inline text={b} /></p>;
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  // handle **bold**, `code`
  const parts: Array<{ t: "b" | "c" | "n"; v: string }> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: "n", v: text.slice(last, m.index) });
    if (m[0].startsWith("**")) parts.push({ t: "b", v: m[0].slice(2, -2) });
    else parts.push({ t: "c", v: m[0].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "n", v: text.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "b") return <strong key={i} className="font-bold text-foreground">{p.v}</strong>;
        if (p.t === "c") return <code key={i} className="rounded bg-muted px-1 py-0.5 text-mono text-[12px] text-neon">{p.v}</code>;
        return <span key={i}>{p.v}</span>;
      })}
    </>
  );
}

function FooterMeta() {
  return (
    <footer className="mt-8 border-t border-border/60 pt-6 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>MAYDAY · RAISE Summit 2026 · Vultr track</div>
        <div className="flex gap-4">
          <span>shop:8000</span>
          <span>brain:8100</span>
          <span>console:8200</span>
          <span>voice:8300</span>
        </div>
        <div>Vultr · LiteLLM · Gradium · Twilio · STAIPH</div>
      </div>
    </footer>
  );
}

function TwilioSettings({
  toNumber,
  setToNumber,
  fromNumber,
  setFromNumber,
  realCallEnabled,
  setRealCallEnabled,
  callStatus,
  watchShop,
  setWatchShop,
}: {
  toNumber: string;
  setToNumber: (v: string) => void;
  fromNumber: string;
  setFromNumber: (v: string) => void;
  realCallEnabled: boolean;
  setRealCallEnabled: (v: boolean) => void;
  callStatus: string;
  watchShop: boolean;
  setWatchShop: (v: boolean) => void;
}) {
  const ready = /^\+\d{6,15}$/.test(toNumber) && /^\+\d{6,15}$/.test(fromNumber);
  return (
    <section className="panel flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${realCallEnabled ? (ready ? "bg-primary pulse-dot" : "bg-warning") : "bg-muted-foreground/40"}`} />
        <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Twilio call</span>
      </div>
      <label className="flex flex-1 items-center gap-2 text-mono text-xs">
        <span className="w-20 shrink-0 text-muted-foreground">To (you)</span>
        <input
          type="tel"
          value={toNumber}
          onChange={(e) => setToNumber(e.target.value.trim())}
          placeholder="+33612345678"
          className="min-w-0 flex-1 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-mono text-xs outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-1 items-center gap-2 text-mono text-xs">
        <span className="w-20 shrink-0 text-muted-foreground">From (Twilio)</span>
        <input
          type="tel"
          value={fromNumber}
          onChange={(e) => setFromNumber(e.target.value.trim())}
          placeholder="+15558675310"
          className="min-w-0 flex-1 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-mono text-xs outline-none focus:border-primary"
        />
      </label>
      <label className="flex shrink-0 items-center gap-2 text-mono text-xs">
        <input
          type="checkbox"
          checked={realCallEnabled}
          onChange={(e) => setRealCallEnabled(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span className={realCallEnabled ? "text-primary" : "text-muted-foreground"}>
          {realCallEnabled ? "LIVE" : "sim"}
        </span>
      </label>
      <label className="flex shrink-0 items-center gap-2 border-l border-border/60 pl-3 text-mono text-xs">
        <input
          type="checkbox"
          checked={watchShop}
          onChange={(e) => setWatchShop(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span className={watchShop ? "text-primary" : "text-muted-foreground"}>
          Watch shop
        </span>
      </label>
      {callStatus && (
        <span className="shrink-0 text-mono text-[11px] text-foreground">{callStatus}</span>
      )}
    </section>
  );
}

function RemoteShopBar({
  url,
  setUrl,
  token,
  setToken,
  status,
  watching,
  busy,
  onAction,
}: {
  url: string;
  setUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  status: string;
  watching: boolean;
  busy: null | "break" | "repair";
  onAction: (action: "break" | "repair") => void;
}) {
  const ok = status.includes("OK");
  const down = status.includes("DOWN") || status.includes("FAIL") || status.includes("error");
  return (
    <section className="panel mt-3 flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 ${watching ? (ok ? "bg-primary pulse-dot" : down ? "bg-danger pulse-dot" : "bg-warning") : "bg-muted-foreground/40"}`} />
        <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Vultr shop</span>
      </div>
      <label className="flex flex-1 items-center gap-2 text-mono text-xs">
        <span className="w-16 shrink-0 text-muted-foreground">URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value.trim())}
          placeholder="http://192.248.185.175"
          className="min-w-0 flex-1 border border-border bg-background/60 px-2.5 py-1.5 text-mono text-xs outline-none focus:border-primary"
        />
      </label>
      <label className="flex items-center gap-2 text-mono text-xs">
        <span className="w-12 shrink-0 text-muted-foreground">TOKEN</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="optional"
          className="w-32 border border-border bg-background/60 px-2.5 py-1.5 text-mono text-xs outline-none focus:border-primary"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy !== null || !url.trim()}
          onClick={() => onAction("break")}
          className="border border-danger/60 bg-danger/10 px-3 py-1.5 text-mono text-[11px] uppercase tracking-widest text-danger hover:bg-danger/20 disabled:opacity-40"
        >
          {busy === "break" ? "breaking…" : "Break shop"}
        </button>
        <button
          type="button"
          disabled={busy !== null || !url.trim()}
          onClick={() => onAction("repair")}
          className="border border-primary/60 bg-primary/10 px-3 py-1.5 text-mono text-[11px] uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {busy === "repair" ? "repairing…" : "Repair"}
        </button>
      </div>
      <span className={`shrink-0 text-mono text-[11px] ${ok ? "text-primary" : down ? "text-danger" : "text-muted-foreground"}`}>
        {status || (watching ? "polling…" : "watch disabled")}
      </span>
    </section>
  );
}


