import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Zap, RotateCcw, Phone, PhoneCall, PhoneIncoming, Mic, FileText, Wifi,
  AlertTriangle, Store, ArrowUpRight, Settings2, X,
} from "lucide-react";
import {
  AFTER_APPROVAL,
  PHONE_BRIEF,
  SCRIPT,
  SLA_EUR_PER_MIN,
  buildPostmortem,
  makeIncidentId,
  resolutionSteps,
  type Metrics,
  type Phase,
  type ScriptStep,
  type TimelineEvent,
} from "@/lib/mayday/script";
import { getIncidentDecision, startMaydayCall } from "@/lib/mayday/call.functions";

const GREEN_METRICS: Metrics = { error_rate: 0.006, p95_ms: 168, rps: 58, green: true };

type Health = {
  green: boolean; broken: boolean; reason: string;
  error_rate: number; p95_ms: number; rps: number; orders: number;
};

function nowIso() {
  return new Date().toISOString().slice(11, 19);
}

function maskPhone(p: string) {
  if (!/^\+\d{6,15}$/.test(p)) return "on-call";
  return `${p.slice(0, 4)} ●● ●● ${p.slice(-2)}`;
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

const STATUS_TEXT: Record<Phase, string> = {
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

function lsGet(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function MaydayConsole() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(GREEN_METRICS);
  const [ringing, setRinging] = useState(false);
  const [euroLost, setEuroLost] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [resolvedAt, setResolvedAt] = useState<number | null>(null);
  const [callAnswered, setCallAnswered] = useState(false);
  const [briefIndex, setBriefIndex] = useState(0);
  const [incidentRef, setIncidentRef] = useState<string>("");
  const [postmortem, setPostmortem] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // --- Config (persisted) ---
  const [toNumber, setToNumber] = useState<string>(() => lsGet("mayday.to"));
  const [fromNumber, setFromNumber] = useState<string>(() => lsGet("mayday.from"));
  const [realCallEnabled, setRealCallEnabled] = useState<boolean>(() => lsGet("mayday.real") === "1");
  const [watchShop, setWatchShop] = useState<boolean>(() => lsGet("mayday.watch") === "1");
  const [remoteShopUrl, setRemoteShopUrl] = useState<string>(() => lsGet("mayday.remote", "http://192.248.185.175"));
  const [remoteShopToken, setRemoteShopToken] = useState<string>(() => lsGet("mayday.remoteToken"));

  // --- Live wiring state ---
  const [callStatus, setCallStatus] = useState<string>("");
  const [twilioId, setTwilioId] = useState<string | null>(null);
  const [liveHealth, setLiveHealth] = useState<Health | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<string>("");
  const [remoteBusy, setRemoteBusy] = useState<null | "break" | "repair">(null);

  const timeoutsRef = useRef<number[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);
  const verifyRef = useRef<number | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const remoteUrlRef = useRef(remoteShopUrl);
  const remoteTokenRef = useRef(remoteShopToken);
  const incidentRefRef = useRef(incidentRef);

  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.to", toNumber); }, [toNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.from", fromNumber); }, [fromNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.real", realCallEnabled ? "1" : "0"); }, [realCallEnabled]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.watch", watchShop ? "1" : "0"); }, [watchShop]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.remote", remoteShopUrl); remoteUrlRef.current = remoteShopUrl; }, [remoteShopUrl]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("mayday.remoteToken", remoteShopToken); remoteTokenRef.current = remoteShopToken; }, [remoteShopToken]);
  useEffect(() => { runStartedAtRef.current = runStartedAt; }, [runStartedAt]);
  useEffect(() => { incidentRefRef.current = incidentRef; }, [incidentRef]);

  const startCall = useServerFn(startMaydayCall);
  const pollDecision = useServerFn(getIncidentDecision);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
    if (verifyRef.current) { window.clearInterval(verifyRef.current); verifyRef.current = null; }
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
      setEuroLost(Math.floor((SLA_EUR_PER_MIN / 60) * secs * 10) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [runStartedAt, resolvedAt]);

  // Type-out the phone brief once answered
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

  // --- Real actions against the shops -------------------------------------

  const breakShops = useCallback(async () => {
    // Internal demo shop: really break it (the /shop page starts failing).
    fetch("/api/shop/admin/break", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ on: true, reason: "INVENTORY_SERVICE_URL → dead port :9999 after deploy abc123" }),
    }).catch(() => { /* demo continues either way */ });
    // Remote VM shop, if configured.
    const url = remoteUrlRef.current.trim();
    if (url) {
      fetch("/api/vultr-shop/break", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, action: "break", token: remoteTokenRef.current.trim() || undefined }),
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setRemoteStatus(j.ok ? `remote break OK · ${j.latency_ms}ms` : `remote break FAIL · ${j.error ?? j.upstream_status ?? "?"}`);
      }).catch((e) => setRemoteStatus(`remote break error · ${(e as Error).message}`));
    }
  }, []);

  const repairShops = useCallback(async () => {
    fetch("/api/shop/admin/break", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ on: false }),
    }).catch(() => { /* ignore */ });
    const url = remoteUrlRef.current.trim();
    if (url) {
      fetch("/api/vultr-shop/break", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, action: "repair", token: remoteTokenRef.current.trim() || undefined }),
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setRemoteStatus(j.ok ? `remote repair OK · ${j.latency_ms}ms` : `remote repair FAIL · ${j.error ?? j.upstream_status ?? "?"}`);
      }).catch((e) => setRemoteStatus(`remote repair error · ${(e as Error).message}`));
    }
  }, []);

  const probeAll = useCallback(async (): Promise<{ green: boolean; probe: string }> => {
    let internalGreen = false;
    let probe = "";
    try {
      const r = await fetch("/api/shop/health", { cache: "no-store" });
      const h = (await r.json()) as Health;
      internalGreen = h.green;
      probe = `error_rate=${h.error_rate.toFixed(3)} · p95=${h.p95_ms}ms`;
    } catch { probe = "internal probe failed"; }
    const url = remoteUrlRef.current.trim();
    if (!url) return { green: internalGreen, probe: `${probe} · 60s clean window` };
    try {
      const r = await fetch(`/api/vultr-shop/health?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const h = await r.json();
      return { green: internalGreen && h.ok, probe: `${probe} · remote 200 in ${h.latency_ms}ms` };
    } catch {
      return { green: false, probe: `${probe} · remote unreachable` };
    }
  }, []);

  // Poll real health until green, then push the resolution steps.
  const startVerification = useCallback(() => {
    if (verifyRef.current) window.clearInterval(verifyRef.current);
    const startedVerify = Date.now();
    const tick = async () => {
      const { green, probe } = await probeAll();
      const timedOut = Date.now() - startedVerify > 60_000;
      if (!green && !timedOut) return;
      if (verifyRef.current) { window.clearInterval(verifyRef.current); verifyRef.current = null; }
      if (!green && timedOut) {
        setPhase("rejected");
        setEvents((prev) => [...prev, {
          id: `${Date.now()}`, ts: nowIso(), type: "verifying",
          title: "verify_recovery → timeout after 60s",
          body: "Service still degraded. Escalating to on-call team with full evidence.",
        }]);
        return;
      }
      const started = runStartedAtRef.current ?? Date.now();
      const end = Date.now();
      setResolvedAt(end);
      const durationSecs = Math.floor((end - started) / 1000);
      const euro = Math.floor((SLA_EUR_PER_MIN / 60) * ((end - started) / 1000) * 10) / 10;
      setEuroLost(euro);
      const inc = incidentRefRef.current || makeIncidentId();
      runScript(resolutionSteps({ durationSecs, euroLost: euro, incidentId: inc, probe }));
      const pmId = window.setTimeout(() => setPostmortem(buildPostmortem({ incidentId: inc, durationSecs, euroLost: euro })), 1500);
      timeoutsRef.current.push(pmId);
    };
    tick();
    verifyRef.current = window.setInterval(tick, 2000);
  }, [probeAll, runScript]);

  // --- Incident lifecycle ---------------------------------------------------

  const breakProduction = useCallback((source: "manual" | "watchdog", reason?: string) => {
    clearTimers();
    setEvents([]);
    setRinging(false);
    setPostmortem(null);
    setCallAnswered(false);
    setBriefIndex(0);
    setResolvedAt(null);
    setEuroLost(0);
    setRunStartedAt(Date.now());
    runStartedAtRef.current = Date.now();
    setPhase("alert");
    setTwilioId(null);
    setCallStatus(reason ?? "");
    setIncidentRef(makeIncidentId());
    if (source === "manual") breakShops();
    runScript(SCRIPT, () => setPhase("awaiting_approval"));
  }, [clearTimers, runScript, breakShops]);

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
      setEvents((prev) => [...prev, {
        id: `${Date.now()}`, ts: nowIso(), type: "approval",
        title: "Human said \"WAIT\" — holding",
        body: "MAYDAY will re-ask in 60s or on human input.",
      }]);
      return;
    }
    if (choice === "rollback") {
      setRinging(false);
      setCallAnswered(false);
      setPhase("rejected");
      setEvents((prev) => [...prev, {
        id: `${Date.now()}`, ts: nowIso(), type: "approval",
        title: "Human said \"ROLLBACK\" — escalating to on-call team",
        body: "MAYDAY stands down. Human takes the wheel.",
      }]);
      return;
    }
    // GO — really repair, then verify against live health.
    setRinging(false);
    repairShops();
    runScript(AFTER_APPROVAL, () => startVerification());
  }, [phase, runScript, repairShops, startVerification]);

  const reset = useCallback(() => {
    clearTimers();
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    repairShops(); // demo-reset: return everything to known-good
    setEvents([]);
    setMetrics(GREEN_METRICS);
    setRinging(false);
    setEuroLost(0);
    setRunStartedAt(null);
    setResolvedAt(null);
    setPostmortem(null);
    setCallAnswered(false);
    setBriefIndex(0);
    setPhase("idle");
    setTwilioId(null);
    setCallStatus("");
    setIncidentRef("");
  }, [clearTimers, repairShops]);

  // Trigger real Twilio call the moment the script starts ringing
  useEffect(() => {
    if (!ringing || !realCallEnabled || twilioId) return;
    if (!toNumber || !fromNumber) {
      setCallStatus("Set your phone + Twilio number in CONFIG to enable the real call");
      return;
    }
    setCallStatus("Placing Twilio call…");
    startCall({ data: { to: toNumber, from: fromNumber, brief: PHONE_BRIEF, stateUrl: remoteUrlRef.current.trim() || undefined } })
      .then((r) => {
        setTwilioId(r.id);
        setCallStatus(`Ringing ${toNumber} · SID …${(r.callSid ?? "").slice(-6) || "?"}`);
      })
      .catch((e: unknown) => setCallStatus(`Call failed: ${(e as Error)?.message ?? "call failed"}`));
  }, [ringing, realCallEnabled, toNumber, fromNumber, twilioId, startCall]);

  // Poll for the caller's decision (DTMF or speech), mirror it into the UI
  useEffect(() => {
    if (!twilioId) return;
    if (phase === "resolved" || phase === "rejected" || phase === "idle") return;
    const id = window.setInterval(async () => {
      try {
        const r = await pollDecision({ data: { id: twilioId, stateUrl: remoteUrlRef.current.trim() || undefined } });
        if (r.decision) {
          window.clearInterval(id);
          pollRef.current = null;
          setCallStatus(`Phone reply: ${r.decision.toUpperCase()}`);
          if (!callAnswered) { setCallAnswered(true); setBriefIndex(PHONE_BRIEF.length); }
          decide(r.decision);
        }
      } catch { /* keep polling */ }
    }, 1500);
    pollRef.current = id;
    return () => { window.clearInterval(id); pollRef.current = null; };
  }, [twilioId, phase, pollDecision, decide, callAnswered]);

  // Watchdog: poll internal + remote health; auto-trigger the loop on breakage.
  useEffect(() => {
    if (!watchShop) { setLiveHealth(null); setRemoteStatus(""); return; }
    const canTrigger = () => phase === "idle" || phase === "resolved" || phase === "rejected";
    const tick = async () => {
      let broken = false;
      let reason = "";
      try {
        const r = await fetch("/api/shop/health", { cache: "no-store" });
        const h = (await r.json()) as Health;
        setLiveHealth(h);
        if (h.broken) { broken = true; reason = `internal shop · ${h.reason}`; }
      } catch { /* ignore */ }
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
        breakProduction("watchdog", reason);
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
    // euroLost dep keeps this ticking while the counter runs
  }, [runStartedAt, resolvedAt, euroLost]);

  const remoteAction = useCallback(async (action: "break" | "repair") => {
    const url = remoteShopUrl.trim();
    if (!url) return;
    setRemoteBusy(action);
    try {
      const r = await fetch("/api/vultr-shop/break", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, action, token: remoteShopToken.trim() || undefined }),
      });
      const j = await r.json();
      setRemoteStatus(j.ok ? `remote ${action} OK · ${j.latency_ms}ms` : `remote ${action} FAIL · ${j.error ?? j.upstream_status ?? "?"}`);
    } catch (e) {
      setRemoteStatus(`remote ${action} error · ${(e as Error).message}`);
    } finally {
      setRemoteBusy(null);
    }
  }, [remoteShopUrl, remoteShopToken]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        phase={phase}
        isBroken={isBroken}
        euroLost={euroLost}
        durationSecs={durationSecs}
        incidentRef={incidentRef}
        canBreak={canBreak}
        onBreak={() => breakProduction("manual")}
        onReset={reset}
        showConfig={showConfig}
        onToggleConfig={() => setShowConfig((v) => !v)}
        live={realCallEnabled}
        watching={watchShop}
      />

      {showConfig && (
        <ConfigPanel
          toNumber={toNumber} setToNumber={setToNumber}
          fromNumber={fromNumber} setFromNumber={setFromNumber}
          realCallEnabled={realCallEnabled} setRealCallEnabled={setRealCallEnabled}
          watchShop={watchShop} setWatchShop={setWatchShop}
          remoteShopUrl={remoteShopUrl} setRemoteShopUrl={setRemoteShopUrl}
          remoteShopToken={remoteShopToken} setRemoteShopToken={setRemoteShopToken}
          remoteStatus={remoteStatus} remoteBusy={remoteBusy} onRemoteAction={remoteAction}
          callStatus={callStatus}
          onClose={() => setShowConfig(false)}
        />
      )}

      <main className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 lg:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Timeline events={events} phase={phase} scrollRef={timelineRef} />
          <div className="flex flex-col gap-4">
            <ServicePanel
              metrics={metrics}
              phase={phase}
              liveHealth={liveHealth}
              remoteStatus={remoteStatus}
              watching={watchShop}
            />
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
              toNumber={toNumber}
            />
          </div>
        </div>

        {postmortem && (
          <PostmortemPanel source={postmortem} incidentRef={incidentRef} durationSecs={durationSecs} euroLost={euroLost} />
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>MAYDAY · RAISE Summit 2026 · Vultr track</span>
          <span>detect → investigate → decide → call → approve → fix → verify</span>
          <span>Vultr · LiteLLM · Twilio · STAIPH</span>
        </footer>
      </main>
    </div>
  );
}

// --- Header ------------------------------------------------------------------

function Header({
  phase, isBroken, euroLost, durationSecs, incidentRef, canBreak,
  onBreak, onReset, showConfig, onToggleConfig, live, watching,
}: {
  phase: Phase; isBroken: boolean; euroLost: number; durationSecs: number;
  incidentRef: string; canBreak: boolean;
  onBreak: () => void; onReset: () => void;
  showConfig: boolean; onToggleConfig: () => void;
  live: boolean; watching: boolean;
}) {
  const active = phase !== "idle";
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-stretch gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center text-mono text-lg font-bold ${isBroken ? "bg-danger text-white glow-red" : "bg-primary text-primary-foreground glow-green"}`}>
            M
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              MAYDAY
              <span className="hidden sm:inline">· autonomous incident response</span>
              {live && <span className="bg-foreground px-1.5 py-px text-[9px] text-background">LIVE CALL</span>}
              {watching && <span className="border border-border px-1.5 py-px text-[9px]">WATCHDOG</span>}
            </div>
            <h1 className="truncate text-lg font-bold leading-tight">
              {STATUS_TEXT[phase]}
              {active && incidentRef && (
                <span className="ml-2 text-mono text-[11px] font-normal text-muted-foreground">{incidentRef}</span>
              )}
            </h1>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-stretch divide-x divide-border border border-border text-mono">
            <div className="px-3 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">€ lost</div>
              <div className={`text-base font-bold leading-tight tabular-nums ${active && isBroken ? "text-danger" : ""}`}>
                {euroLost.toFixed(1)}
              </div>
            </div>
            <div className="px-3 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">duration</div>
              <div className="text-base font-bold leading-tight tabular-nums">
                {Math.floor(durationSecs / 60)}:{String(durationSecs % 60).padStart(2, "0")}
              </div>
            </div>
            <div className="hidden px-3 py-1.5 sm:block">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">sla</div>
              <div className="text-base font-bold leading-tight tabular-nums">€{SLA_EUR_PER_MIN}/min</div>
            </div>
          </div>

          <Link
            to="/shop"
            className="flex h-full items-center gap-1.5 border border-border px-3 py-2 text-mono text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background"
          >
            <Store className="h-3.5 w-3.5" /> Shop <ArrowUpRight className="h-3 w-3" />
          </Link>
          <button
            onClick={onToggleConfig}
            className={`flex items-center gap-1.5 border border-border px-3 py-2 text-mono text-[11px] uppercase tracking-widest ${showConfig ? "bg-foreground text-background" : "hover:bg-foreground hover:text-background"}`}
          >
            <Settings2 className="h-3.5 w-3.5" /> Config
          </button>
          {canBreak ? (
            <button
              onClick={onBreak}
              className="flex items-center gap-2 bg-danger px-4 py-2 text-sm font-bold text-white hover:brightness-110 active:scale-95"
            >
              <Zap className="h-4 w-4" /> Break production
            </button>
          ) : (
            <button
              onClick={onReset}
              className="flex items-center gap-2 border border-border px-4 py-2 text-sm font-medium hover:bg-foreground hover:text-background"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// --- Config ------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-mono text-xs">
      <span className="w-24 shrink-0 uppercase tracking-widest text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ConfigPanel({
  toNumber, setToNumber, fromNumber, setFromNumber,
  realCallEnabled, setRealCallEnabled, watchShop, setWatchShop,
  remoteShopUrl, setRemoteShopUrl, remoteShopToken, setRemoteShopToken,
  remoteStatus, remoteBusy, onRemoteAction, callStatus, onClose,
}: {
  toNumber: string; setToNumber: (v: string) => void;
  fromNumber: string; setFromNumber: (v: string) => void;
  realCallEnabled: boolean; setRealCallEnabled: (v: boolean) => void;
  watchShop: boolean; setWatchShop: (v: boolean) => void;
  remoteShopUrl: string; setRemoteShopUrl: (v: string) => void;
  remoteShopToken: string; setRemoteShopToken: (v: string) => void;
  remoteStatus: string; remoteBusy: null | "break" | "repair";
  onRemoteAction: (a: "break" | "repair") => void;
  callStatus: string; onClose: () => void;
}) {
  const input = "min-w-0 flex-1 border border-border bg-background px-2.5 py-1.5 text-mono text-xs outline-none focus:bg-muted";
  return (
    <div className="border-b border-border bg-muted/60">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-2 lg:px-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">01 · Twilio voice</span>
            <label className="flex items-center gap-2 text-mono text-xs">
              <input type="checkbox" checked={realCallEnabled} onChange={(e) => setRealCallEnabled(e.target.checked)} className="h-4 w-4 accent-black" />
              <span>{realCallEnabled ? "REAL CALL ON" : "simulation"}</span>
            </label>
          </div>
          <Field label="To (you)">
            <input type="tel" value={toNumber} onChange={(e) => setToNumber(e.target.value.trim())} placeholder="+33612345678" className={input} />
          </Field>
          <Field label="From (Twilio)">
            <input type="tel" value={fromNumber} onChange={(e) => setFromNumber(e.target.value.trim())} placeholder="+15558675310" className={input} />
          </Field>
          {callStatus && <div className="border border-border bg-background px-2.5 py-1.5 text-mono text-[11px]">{callStatus}</div>}
          <p className="text-mono text-[10px] text-muted-foreground">
            Answer the call, then say « GO », « ROLLBACK » or « WAIT » — or press 1 / 2 / 3.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">02 · Shop under watch</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-mono text-xs">
                <input type="checkbox" checked={watchShop} onChange={(e) => setWatchShop(e.target.checked)} className="h-4 w-4 accent-black" />
                <span>{watchShop ? "WATCHDOG ON" : "watchdog off"}</span>
              </label>
              <button onClick={onClose} aria-label="Close config" className="border border-border p-1 hover:bg-foreground hover:text-background">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <Field label="VM URL">
            <input type="url" value={remoteShopUrl} onChange={(e) => setRemoteShopUrl(e.target.value.trim())} placeholder="http://192.248.185.175" className={input} />
          </Field>
          <Field label="Token">
            <input type="password" value={remoteShopToken} onChange={(e) => setRemoteShopToken(e.target.value)} placeholder="optional bearer token" className={input} />
          </Field>
          <div className="flex items-center gap-2">
            <button
              disabled={remoteBusy !== null || !remoteShopUrl.trim()}
              onClick={() => onRemoteAction("break")}
              className="border border-danger bg-background px-3 py-1.5 text-mono text-[11px] uppercase tracking-widest text-danger hover:bg-danger hover:text-white disabled:opacity-40"
            >{remoteBusy === "break" ? "breaking…" : "Break VM shop"}</button>
            <button
              disabled={remoteBusy !== null || !remoteShopUrl.trim()}
              onClick={() => onRemoteAction("repair")}
              className="border border-border px-3 py-1.5 text-mono text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background disabled:opacity-40"
            >{remoteBusy === "repair" ? "repairing…" : "Repair VM shop"}</button>
            {remoteStatus && <span className="min-w-0 truncate text-mono text-[11px] text-muted-foreground">{remoteStatus}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Timeline ------------------------------------------------------------------

function Timeline({
  events, phase, scrollRef,
}: {
  events: TimelineEvent[]; phase: Phase;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const busy = phase !== "idle" && phase !== "resolved" && phase !== "rejected";
  return (
    <section className="panel flex min-h-[520px] flex-col overflow-hidden lg:h-[calc(100vh-140px)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 ${busy ? "bg-neon pulse-dot" : "bg-success"}`} />
          <span className="text-mono text-[11px] uppercase tracking-[0.2em]">01 · agent loop</span>
          <span className="text-mono text-[10px] text-muted-foreground">brain:8100 · SSE</span>
        </div>
        <span className="hidden text-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">Vultr Serverless Inference · LiteLLM</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="space-y-3">
            {events.map((e) => (
              <TimelineItem key={e.id} event={e} />
            ))}
            {busy && (
              <li className="flex items-center gap-2 text-mono text-xs text-muted-foreground">
                <span className="h-2 w-2 bg-neon pulse-dot" />
                thinking<span className="caret-blink">…</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-md">
        <div className="text-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">MAYDAY console</div>
        <h2 className="mt-3 text-3xl font-bold leading-tight">
          Your infrastructure just called.<br />It fixed itself.
        </h2>
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
          Hit <span className="text-mono font-bold text-danger">Break production</span> to push a real config
          regression to the shop. The agent investigates, cites its runbooks, phones the on-call human,
          and closes the loop.
        </p>
        <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 border border-border text-mono text-[10px] uppercase tracking-widest">
          {["detect", "decide", "call", "approve", "fix", "verify"].map((s, i) => (
            <div key={s} className={`px-2 py-2 ${i % 3 !== 2 ? "border-r border-border" : ""} ${i < 3 ? "border-b border-border" : ""}`}>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ event: e }: { event: TimelineEvent }) {
  return (
    <li>
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0 pt-0.5 text-mono text-[10px] tabular-nums text-muted-foreground">{e.ts}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`text-mono text-[10px] font-bold uppercase tracking-widest ${typeColor(e.type)}`}>
              {typeLabel(e.type)}
            </span>
            <span className="text-sm font-semibold">{e.title}</span>
          </div>
          {e.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.body}</p>
          )}
          {e.meta && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Object.entries(e.meta).map(([k, v]) => (
                <span key={k} className="border border-border px-1.5 py-0.5 text-mono text-[10px]">
                  <span className="text-muted-foreground">{k}=</span>
                  <span>{v}</span>
                </span>
              ))}
            </div>
          )}
          {e.tool && (
            <div className="mt-1 border border-warning bg-background px-2 py-1.5 text-mono text-xs">
              <span className="text-warning">→ {e.tool}</span>
              <span className="text-muted-foreground">({JSON.stringify(e.args ?? {}).slice(1, -1) || "…"})</span>
            </div>
          )}
          {e.result && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap border border-border bg-muted px-2.5 py-2 text-mono text-[11px] leading-relaxed text-muted-foreground">
              {e.result}
            </pre>
          )}
          {e.citations && (
            <div className="mt-2 space-y-1.5">
              {e.citations.map((c, i) => (
                <div key={i} className="border border-neon bg-background px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-mono text-[10px]">
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-neon">{c.doc}</span>
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

// --- Service panel ------------------------------------------------------------

function ServicePanel({
  metrics, phase, liveHealth, remoteStatus, watching,
}: {
  metrics: Metrics; phase: Phase; liveHealth: Health | null;
  remoteStatus: string; watching: boolean;
}) {
  const bars = useMemo(() => {
    const base = metrics.error_rate;
    return Array.from({ length: 40 }).map((_, i) => {
      const jitter = (Math.sin(i * 1.3) + 1) * 0.15;
      return Math.min(1, base * (0.6 + jitter));
    });
  }, [metrics.error_rate]);

  const isBroken = !metrics.green;
  const remoteOk = remoteStatus.includes("OK");
  const remoteDown = remoteStatus.includes("DOWN") || remoteStatus.includes("error") || remoteStatus.includes("FAIL");

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 ${isBroken ? "bg-danger pulse-dot" : "bg-success"}`} />
          <span className="text-mono text-[11px] uppercase tracking-[0.2em]">02 · service</span>
          <span className="text-mono text-[10px] text-muted-foreground">shop:8000</span>
        </div>
        <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">metrics</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-mono">
        <MetricCell label="error rate" value={`${(metrics.error_rate * 100).toFixed(1)}%`} tone={isBroken ? "danger" : "success"} />
        <MetricCell label="p95" value={`${metrics.p95_ms}ms`} tone={metrics.p95_ms > 500 ? "warning" : "muted"} />
        <MetricCell label="rps" value={`${metrics.rps}`} tone="muted" />
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>error_rate — last 60s</span>
          <span className={isBroken ? "text-danger" : "text-success"}>
            {isBroken ? "▲ CRITICAL" : "▼ nominal"}
          </span>
        </div>
        <div className={`flex h-20 items-end gap-[3px] border p-2 ${isBroken ? "border-danger" : "border-border"}`}>
          {bars.map((v, i) => (
            <div
              key={i}
              className={`flex-1 transition-all duration-500 ${isBroken ? "bg-danger" : "bg-success"}`}
              style={{ height: `${Math.max(4, v * 100)}%`, opacity: 0.35 + v * 0.65 }}
            />
          ))}
        </div>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="mb-1.5 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">live probes</div>
        <div className="space-y-1 text-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 ${!watching ? "bg-border" : liveHealth?.green ? "bg-success" : "bg-danger"}`} />
            <span className="text-muted-foreground">internal</span>
            <span className="ml-auto tabular-nums">
              {!watching ? "watchdog off" : liveHealth ? `err ${(liveHealth.error_rate * 100).toFixed(1)}% · ${liveHealth.orders} orders` : "probing…"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 ${!watching ? "bg-border" : remoteOk ? "bg-success" : remoteDown ? "bg-danger" : "bg-warning"}`} />
            <span className="text-muted-foreground">vultr vm</span>
            <span className="ml-auto max-w-[60%] truncate tabular-nums">{!watching ? "—" : remoteStatus || "probing…"}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="mb-1.5 text-mono text-[10px] uppercase tracking-widest text-muted-foreground">recent commits</div>
        <ul className="space-y-1 text-mono text-[11px]">
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

      <div className="border-t border-border bg-muted px-4 py-2.5">
        <div className="flex flex-wrap gap-1 text-mono text-[10px]">
          {["get_metrics", "get_logs", "get_git_history", "retrieve_docs", "request_approval", "apply_fix", "verify_recovery"].map((t) => (
            <span key={t} className="border border-border bg-background px-1.5 py-0.5 text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "warning" | "muted" }) {
  const color = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    muted: "",
  }[tone];
  return (
    <div className="px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

// --- Phone panel ----------------------------------------------------------------

function PhonePanel({
  ringing, phase, callAnswered, briefText, briefDone,
  onAnswer, onDecide, realCallEnabled, callStatus, toNumber,
}: {
  ringing: boolean; phase: Phase; callAnswered: boolean;
  briefText: string; briefDone: boolean;
  onAnswer: () => void;
  onDecide: (choice: "go" | "rollback" | "wait") => void;
  realCallEnabled: boolean; callStatus: string; toNumber: string;
}) {
  const awaiting = phase === "awaiting_approval" || phase === "ringing";
  const canDecide = callAnswered && briefDone && awaiting;

  const statusLine = (() => {
    if (phase === "resolved") return "call ended · resolved";
    if (phase === "rejected") return "call ended · human took over";
    if (phase === "fixing" || phase === "verifying") return "call ended · GO received";
    if (callAnswered && !briefDone) return "MAYDAY speaking…";
    if (callAnswered && briefDone) return "awaiting your reply";
    if (ringing) return "ringing · answer the call";
    if (phase === "calling") return "dialing…";
    if (phase === "investigating" || phase === "deciding") return "not called yet";
    if (phase === "alert") return "—";
    if (phase === "awaiting_approval") return "awaiting approval";
    return "standing by";
  })();

  return (
    <section className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 ${ringing ? "bg-warning pulse-dot" : callAnswered ? "bg-success" : "bg-border"}`} />
          <span className="text-mono text-[11px] uppercase tracking-[0.2em]">03 · on-call</span>
          <span className="text-mono text-[10px] text-muted-foreground">voice:8300</span>
        </div>
        <span className={`text-mono text-[10px] uppercase tracking-widest ${realCallEnabled ? "" : "text-muted-foreground"}`}>
          {realCallEnabled ? "■ LIVE · Twilio" : "□ simulation"}
        </span>
      </div>

      {callStatus && (
        <div className="border-b border-border bg-muted px-4 py-2 text-mono text-[11px]">{callStatus}</div>
      )}

      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-4">
          <div className={`relative grid h-14 w-14 shrink-0 place-items-center border ${
            ringing ? "border-warning" : callAnswered ? "border-success" : "border-border"
          }`}>
            {ringing && <span className="absolute inset-0 animate-ping bg-warning/20" />}
            {callAnswered ? (
              <PhoneCall className="h-6 w-6 text-success" />
            ) : ringing ? (
              <PhoneIncoming className="h-6 w-6 text-warning ring-shake" />
            ) : (
              <Phone className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <Wifi className="h-3 w-3" /> {ringing || callAnswered ? "Incoming · MAYDAY" : "on-call line"}
            </div>
            <div className="mt-0.5 text-mono text-base font-bold tabular-nums">{maskPhone(toNumber)}</div>
            <div className="mt-1 text-mono text-[11px] text-muted-foreground">{statusLine}</div>
          </div>
        </div>

        {ringing && !callAnswered && (
          <button
            onClick={onAnswer}
            className="mt-4 flex w-full items-center justify-center gap-2 bg-warning px-4 py-3 text-sm font-bold text-white hover:brightness-110 active:scale-95"
          >
            <PhoneCall className="h-4 w-4" /> Answer call
          </button>
        )}
      </div>

      {callAnswered && (
        <div className="border-b border-border px-5 py-4">
          <div className="mb-2 flex items-center justify-between text-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mic className="h-3 w-3" /> MAYDAY briefing</span>
            <span>TTS</span>
          </div>
          <p className="text-[13px] leading-relaxed">
            {briefText}
            {!briefDone && <span className="caret-blink">▊</span>}
          </p>
        </div>
      )}

      {canDecide && (
        <div className="space-y-2.5 px-5 py-4">
          <div className="text-center text-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">your reply · STT</div>
          <button
            onClick={() => onDecide("go")}
            className="flex w-full items-center justify-center gap-2 bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground glow-green hover:brightness-110 active:scale-95"
          >
            <Mic className="h-4 w-4" /> Say "GO"
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onDecide("rollback")}
              className="flex items-center justify-center gap-2 border border-danger px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger hover:text-white"
            ><AlertTriangle className="h-3.5 w-3.5" /> ROLLBACK</button>
            <button
              onClick={() => onDecide("wait")}
              className="border border-border px-3 py-2.5 text-sm font-semibold hover:bg-foreground hover:text-background"
            >WAIT</button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground">
            Unclear reply → voice re-asks once → else "wait"
          </p>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 divide-x divide-border border-t border-border bg-muted text-mono text-[10px]">
        <div className="px-4 py-2">
          <div className="uppercase tracking-widest text-muted-foreground">safety</div>
          <div>approval-gated</div>
        </div>
        <div className="px-4 py-2">
          <div className="uppercase tracking-widest text-muted-foreground">audit</div>
          <div>Ed25519-signed</div>
        </div>
      </div>
    </section>
  );
}

// --- Post-mortem ------------------------------------------------------------------

function PostmortemPanel({
  source, incidentRef, durationSecs, euroLost,
}: {
  source: string; incidentRef: string; durationSecs: number; euroLost: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="panel mt-4 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-muted"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-5 w-5" />
          <div className="min-w-0">
            <div className="text-mono text-[10px] uppercase tracking-widest text-success">04 · post-mortem · committed</div>
            <div className="truncate text-base font-bold">docs/postmortems/{incidentRef}.md</div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-mono text-xs sm:flex">
          <span><span className="text-muted-foreground">duration </span>{Math.floor(durationSecs / 60)}m {String(durationSecs % 60).padStart(2, "0")}s</span>
          <span><span className="text-muted-foreground">impact </span>€{euroLost.toFixed(0)}</span>
          <span>{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <article className="max-w-none px-6 py-5 text-sm">
          <MarkdownLite source={source} />
        </article>
      )}
    </section>
  );
}

// Minimal, safe markdown-ish renderer for the post-mortem
function MarkdownLite({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold">{b.slice(2)}</h1>;
        if (b.startsWith("## ")) return <h2 key={i} className="mt-4 border-b border-border pb-1 text-lg font-bold">{b.slice(3)}</h2>;
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
  const parts: Array<{ t: "b" | "c" | "n"; v: string }> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: "n", v: text.slice(last, m.index) });
    if (m[0].startsWith("**")) parts.push({ t: "b", v: m[0].slice(2, -2) });
    else if (m[0].startsWith("`")) parts.push({ t: "c", v: m[0].slice(1, -1) });
    else parts.push({ t: "n", v: m[0].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "n", v: text.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "b") return <strong key={i} className="font-bold">{p.v}</strong>;
        if (p.t === "c") return <code key={i} className="bg-muted px-1 py-0.5 text-mono text-[12px]">{p.v}</code>;
        return <span key={i}>{p.v}</span>;
      })}
    </>
  );
}
