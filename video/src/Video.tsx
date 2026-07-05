import React from "react";
import {
  AbsoluteFill,
  Easing,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  AMBER,
  BLUE,
  Chip,
  Enter,
  FAINT,
  GREEN,
  INK,
  Label,
  MONO,
  MUTED,
  PAPER,
  Panel,
  RED,
  SANS,
  useTyped,
} from "./theme";

const FPS = 30;
const S1 = 7, S2 = 11, S3 = 22, S4 = 14, S5 = 34, S6 = 30, S7 = 20, S8 = 18;
export const TOTAL_FRAMES = (S1 + S2 + S3 + S4 + S5 + S6 + S7 + S8) * FPS;

// ————————————————————————————————————————————————————————————————— shell —

const Frame: React.FC<{ children: React.ReactNode; kicker?: string; step?: string }> = ({
  children,
  kicker,
  step,
}) => (
  <AbsoluteFill style={{ background: PAPER, fontFamily: SANS, color: INK }}>
    <AbsoluteFill style={{ padding: "64px 90px" }}>
      {(kicker || step) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Enter delay={0.1} y={10}>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: INK,
                  color: PAPER,
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                M
              </div>
              <Label size={24}>{kicker}</Label>
            </div>
          </Enter>
          {step && (
            <Enter delay={0.15} y={10}>
              <Label size={24} color={INK}>
                {step}
              </Label>
            </Enter>
          )}
        </div>
      )}
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);

// ————————————————————————————————————————————————————————————— S1 · title —

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <AbsoluteFill
      style={{
        background: PAPER,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
        color: INK,
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          background: INK,
          color: PAPER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: 64,
          fontWeight: 700,
          transform: `scale(${logo})`,
          boxShadow: `12px 12px 0 0 ${GREEN}`,
        }}
      >
        M
      </div>
      <Enter delay={0.5}>
        <div style={{ fontSize: 130, fontWeight: 700, letterSpacing: -3, marginTop: 40 }}>
          MAYDAY
        </div>
      </Enter>
      <Enter delay={0.9}>
        <div style={{ fontSize: 40, color: MUTED, marginTop: 4 }}>
          Your infrastructure just called. <span style={{ color: INK, fontWeight: 700 }}>It fixed itself.</span>
        </div>
      </Enter>
      <Enter delay={1.4}>
        <div style={{ marginTop: 60 }}>
          <Label size={22}>autonomous incident response · raise summit 2026 · vultr track</Label>
        </div>
      </Enter>
    </AbsoluteFill>
  );
};

// ——————————————————————————————————————————————————————————— S2 · problem —

const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const err = interpolate(t, [2.2, 5], [0.8, 41], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const euros = Math.max(0, (t - 2.2) * 2.5 * 12).toFixed(0);
  const broken = t > 2.2;
  const bars = new Array(38).fill(0).map((_, i) => {
    const rise = interpolate(t, [2.2 + i * 0.05, 3.4 + i * 0.05], [6, 40 + ((i * 37) % 45)], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return rise;
  });
  return (
    <Frame kicker="the problem" step="every minute costs money">
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 110 }}>
        <div style={{ flex: 1 }}>
          <Enter delay={0.2}>
            <div style={{ fontFamily: MONO, fontSize: 34, color: MUTED }}>03:00 AM</div>
          </Enter>
          <Enter delay={0.5}>
            <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.04, marginTop: 12 }}>
              Your checkout
              <br />
              just <span style={{ color: RED }}>died.</span>
            </div>
          </Enter>
          <Enter delay={2.4}>
            <div style={{ fontSize: 36, color: MUTED, marginTop: 34 }}>
              The on-call human is asleep.
              <br />
              The incident is not.
            </div>
          </Enter>
        </div>
        <Enter delay={1.2} style={{ width: 640 }}>
          <Panel>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `2px solid ${INK}`,
                padding: "18px 26px",
              }}
            >
              <Label size={20}>shop · live health</Label>
              <Label size={20} color={broken ? RED : GREEN}>
                {broken ? "▲ critical" : "▼ nominal"}
              </Label>
            </div>
            <div style={{ display: "flex", borderBottom: `2px solid ${INK}` }}>
              <div style={{ flex: 1, padding: "18px 26px", borderRight: `2px solid ${INK}` }}>
                <Label size={17}>error rate</Label>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 56,
                    fontWeight: 700,
                    color: broken ? RED : GREEN,
                  }}
                >
                  {err.toFixed(1)}%
                </div>
              </div>
              <div style={{ flex: 1, padding: "18px 26px" }}>
                <Label size={17}>€ lost · 150/min</Label>
                <div style={{ fontFamily: MONO, fontSize: 56, fontWeight: 700, color: broken ? RED : INK }}>
                  €{euros}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 150, padding: 22 }}>
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{ flex: 1, height: h * 2.6, background: broken ? RED : GREEN, opacity: 0.4 + (h / 90) }}
                />
              ))}
            </div>
          </Panel>
        </Enter>
      </div>
    </Frame>
  );
};

// —————————————————————————————————————————————————————— S3 · architecture —

const ArchBox: React.FC<{
  title: string;
  lines: string[];
  delay: number;
  color?: string;
  width?: number;
}> = ({ title, lines, delay, color = INK, width }) => (
  <Enter delay={delay} style={{ width }}>
    <Panel style={{ borderColor: color }}>
      <div style={{ borderBottom: `2px solid ${color}`, padding: "12px 20px" }}>
        <Label size={19} color={color}>
          {title}
        </Label>
      </div>
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((l) => (
          <div key={l} style={{ fontFamily: MONO, fontSize: 20, color: MUTED }}>
            {l}
          </div>
        ))}
      </div>
    </Panel>
  </Enter>
);

const Arrow: React.FC<{ delay: number; label?: string; vertical?: boolean; flip?: boolean }> = ({
  delay,
  label,
  vertical,
  flip,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay * fps, fps, config: { damping: 200 }, durationInFrames: 18 });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        gap: 8,
        opacity: p,
      }}
    >
      <div
        style={{
          background: INK,
          width: vertical ? 3 : 90 * p,
          height: vertical ? 46 * p : 3,
        }}
      />
      <div style={{ fontFamily: MONO, fontSize: 24, transform: flip ? "rotate(180deg)" : undefined }}>
        {vertical ? "▼" : "▶"}
      </div>
      {label ? (
        <div style={{ fontFamily: MONO, fontSize: 17, color: MUTED, letterSpacing: "0.1em" }}>{label}</div>
      ) : null}
    </div>
  );
};

const Architecture: React.FC = () => (
  <Frame kicker="architecture" step="everything real · nothing mocked">
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <ArchBox
          delay={0.3}
          title="live shop · vultr vm"
          width={430}
          lines={["FastAPI · 192.248.185.175", "GET /health", "POST /admin/break · repair", "shared call state"]}
        />
        <Arrow delay={1.2} label="health poll 3s" />
        <ArchBox
          delay={0.6}
          title="mayday console"
          color={INK}
          width={470}
          lines={["TanStack Start · edge", "watchdog · agent timeline", "€ counter · iPhone live view", "public webhooks"]}
        />
        <Arrow delay={1.5} label="REST" />
        <ArchBox
          delay={0.9}
          title="twilio voice"
          width={430}
          lines={["real outbound call", "status callbacks (answered)", "DTMF keypad 1 · 2 · 3", "Gradium TTS voice"]}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 200 }}>
        <Arrow delay={1.9} vertical />
        <Arrow delay={2.1} vertical />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 60 }}>
        <ArchBox
          delay={2.3}
          title="agent brain · vultr serverless inference"
          color={BLUE}
          width={620}
          lines={["OpenAI-compatible · JSON mode · temp 0.1", "plan → tools → decide (revert · patch · escalate)", "confidence policy · approval-gated"]}
        />
        <ArchBox
          delay={2.6}
          title="docs-corpus · bm25 retrieval"
          color={BLUE}
          width={620}
          lines={["5 runbooks · 5 past incidents · sla.md", "top-k citations: runbook + incident + SLA", "grounded decisions — no invented facts"]}
        />
      </div>
    </div>
  </Frame>
);

// ————————————————————————————————————————————————————————————— S4 · break —

const Break: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cmd = useTyped("curl -X POST http://192.248.185.175/admin/break", 0.8, 46);
  const resShown = t > 2.4;
  const healthShown = t > 3.6;
  const is503 = t > 4.6;
  return (
    <Frame kicker="step 1 · break production" step="a real outage — live on stage">
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 90 }}>
        <div style={{ flex: 1.2 }}>
          <Panel>
            <div style={{ borderBottom: `2px solid ${INK}`, padding: "14px 24px", display: "flex", gap: 12 }}>
              <Label size={19}>ops terminal</Label>
            </div>
            <div style={{ padding: 30, fontFamily: MONO, fontSize: 27, lineHeight: 1.8 }}>
              <div>
                <span style={{ color: MUTED }}>$ </span>
                {cmd}
                <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▊</span>
              </div>
              {resShown && (
                <div style={{ color: RED }}>{`{"ok":true,"broken":true}`}</div>
              )}
              {healthShown && (
                <div style={{ marginTop: 22 }}>
                  <span style={{ color: MUTED }}>$ </span>curl -i http://192.248.185.175/health
                </div>
              )}
              {is503 && (
                <>
                  <div style={{ color: RED, fontWeight: 700 }}>HTTP/1.1 503 Service Unavailable</div>
                  <div style={{ color: RED }}>{`{"status":"degraded","broken":true}`}</div>
                </>
              )}
            </div>
          </Panel>
        </div>
        <div style={{ flex: 1 }}>
          <Enter delay={4.9}>
            <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1 }}>
              The <span style={{ color: RED }}>real</span> shop,
              <br />
              on a <span style={{ color: RED }}>real</span> VM,
              <br />
              is now down.
            </div>
          </Enter>
          <Enter delay={5.6}>
            <div style={{ marginTop: 30, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Chip color={RED}>checkout → 500</Chip>
              <Chip color={RED}>error_rate 41%</Chip>
              <Chip color={RED}>−€150 / min</Chip>
            </div>
          </Enter>
          <Enter delay={6.4}>
            <div style={{ marginTop: 34, fontSize: 30, color: MUTED }}>
              Watchdog detects it in ≤ 3 seconds. No Grafana, no human.
            </div>
          </Enter>
        </div>
      </div>
    </Frame>
  );
};

// ————————————————————————————————————————————————————————— S5 · the agent —

type Ev = { at: number; tag: string; color: string; title: string; body?: string; cite?: [string, string, string] };

const EVENTS: Ev[] = [
  { at: 0.6, tag: "ALERT", color: RED, title: "error_rate_high on shop", body: "POST /brain/webhook/alert · error_rate=0.41 · p95=2200ms" },
  { at: 2.2, tag: "PLAN", color: BLUE, title: "Vultr Serverless Inference · llama-3.3-70b", body: "read metrics → logs → commits → retrieve incidents · runbook · SLA → decide" },
  { at: 4.4, tag: "TOOL", color: AMBER, title: "get_metrics(window=10m)", body: "error_rate=0.41 (baseline 0.008) · p95=2200ms · rps=62" },
  { at: 6.6, tag: "TOOL", color: AMBER, title: "get_logs(shop, 50)", body: "ConnectionError: HTTPConnectionPool(port=9999) — repeated 47×" },
  { at: 8.8, tag: "TOOL", color: AMBER, title: "get_git_history(10)", body: "abc123 · shop/settings.py · INVENTORY_SERVICE_URL: 8000 → 9999" },
  { at: 11.2, tag: "RETRIEVAL", color: BLUE, title: "3 documents · BM25 over docs-corpus", cite: ["sla.md § cost of downtime — score 1.00", "incidents/INC-2025-014.md § root cause — score 0.93", "runbooks/RB-01-config-regression.md § detection — 0.69"] },
  { at: 17.0, tag: "DECISION", color: GREEN, title: "revert abc123 — confidence 0.92", body: "logs + git diff + past incident converge · requires_approval=true" },
];

const AgentLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <Frame kicker="step 2 · the agent investigates" step="grounded in documents — cited, not invented">
      <div style={{ display: "flex", flex: 1, gap: 80, marginTop: 30 }}>
        <div style={{ flex: 1.35, display: "flex", flexDirection: "column", gap: 17 }}>
          {EVENTS.map((e) => (
            <Enter key={e.tag + e.at} delay={e.at} y={16}>
              <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    color: e.color,
                    width: 150,
                    paddingTop: 5,
                  }}
                >
                  {e.tag}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 30, fontWeight: 700 }}>{e.title}</div>
                  {e.body && (
                    <div style={{ fontFamily: MONO, fontSize: 20, color: MUTED, marginTop: 4 }}>{e.body}</div>
                  )}
                  {e.cite && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      {e.cite.map((c, i) => (
                        <Enter key={c} delay={e.at + 0.7 + i * 0.7} y={10}>
                          <div
                            style={{
                              border: `2px solid ${BLUE}`,
                              padding: "8px 16px",
                              fontFamily: MONO,
                              fontSize: 20,
                              color: INK,
                            }}
                          >
                            {c}
                          </div>
                        </Enter>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Enter>
          ))}
        </div>
        <div style={{ width: 500, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
          <Enter delay={12.4}>
            <Panel style={{ borderColor: BLUE }}>
              <div style={{ padding: "20px 26px" }}>
                <Label size={18} color={BLUE}>
                  why it wins the statement
                </Label>
                <div style={{ fontSize: 28, marginTop: 12, lineHeight: 1.45 }}>
                  Plans · retrieves <b>3×</b> · calls <b>7 tools</b> · decides with a confidence
                  policy — <b>&lt; 0.8 ⇒ escalate</b>, never guess.
                </div>
              </div>
            </Panel>
          </Enter>
          <Enter delay={19}>
            <Panel style={{ borderColor: GREEN }}>
              <div style={{ padding: "20px 26px" }}>
                <Label size={18} color={GREEN}>
                  safety
                </Label>
                <div style={{ fontSize: 28, marginTop: 12, lineHeight: 1.45 }}>
                  Every production-changing action is <b>approval-gated</b> — by a human, on a{" "}
                  <b>real phone call</b>.
                </div>
              </div>
            </Panel>
          </Enter>
          {t > 21 ? null : null}
        </div>
      </div>
    </Frame>
  );
};

// —————————————————————————————————————————————————————————— S6 · the call —

const Iphone: React.FC<{ t: number }> = ({ t }) => {
  const ringing = t < 8;
  const shake = ringing ? Math.sin(t * 22) * 1.6 : 0;
  const connectedSecs = Math.max(0, Math.floor(t - 8));
  const brief =
    "MAYDAY here. Checkout just went down. Error rate 41%. Commit abc123 pointed inventory to a dead port. I propose to revert. Press 1 to proceed, 2 to roll back, 3 to wait.";
  const typed = brief.slice(0, Math.max(0, Math.floor((t - 8.6) * 30)));
  const pressed = t > 20.5;
  const keyScale = pressed ? 1 + Math.max(0, 1 - (t - 20.5) * 3) * 0.25 : 1;
  return (
    <div
      style={{
        width: 400,
        borderRadius: 64,
        padding: 13,
        background: "linear-gradient(155deg,#5a5a5e 0%,#2a2a2c 38%,#161618 100%)",
        boxShadow: "0 50px 80px -35px rgba(0,0,0,0.5)",
        transform: `rotate(${shake}deg)`,
      }}
    >
      <div
        style={{
          borderRadius: 52,
          overflow: "hidden",
          aspectRatio: "9/19.5",
          background: ringing ? "#0b0b0c" : PAPER,
          position: "relative",
          fontFamily: SANS,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 120,
            height: 34,
            borderRadius: 20,
            background: "#000",
            zIndex: 3,
          }}
        />
        {ringing ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "110px 40px 60px",
              color: "#fff",
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.3em", color: "#ffffff88" }}>
                INCIDENT P1 · SHOP
              </div>
              <div
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 60,
                  border: "1.5px solid #ffffff33",
                  background: "#ffffff10",
                  margin: "26px auto 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 44,
                  fontWeight: 700,
                }}
              >
                M
              </div>
              <div style={{ fontSize: 42, fontWeight: 700, marginTop: 18 }}>MAYDAY</div>
              <div style={{ fontSize: 21, color: "#ffffff99", marginTop: 4 }}>incoming call…</div>
            </div>
            <div style={{ display: "flex", gap: 120 }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 50,
                  background: RED,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                  color: "#fff",
                }}
              >
                ✕
              </div>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 50,
                  background: GREEN,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                  color: "#fff",
                  transform: `scale(${1 + Math.max(0, Math.sin(t * 6)) * 0.06})`,
                }}
              >
                ✆
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              padding: "92px 34px 44px",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>MAYDAY</div>
              <div style={{ fontFamily: MONO, fontSize: 19, color: GREEN, marginTop: 4 }}>
                ● connected · 0:{String(connectedSecs).padStart(2, "0")}
              </div>
            </div>
            <div style={{ flex: 1, marginTop: 22, fontSize: 20.5, lineHeight: 1.5 }}>
              {typed}
              {typed.length < brief.length && <span>▊</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 6px" }}>
              {[
                { n: "1", l: "GO", c: GREEN },
                { n: "2", l: "ROLL", c: RED },
                { n: "3", l: "WAIT", c: INK },
              ].map((k) => (
                <div key={k.n} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 50,
                      border: `3px solid ${k.c}`,
                      color: k.n === "1" && pressed ? PAPER : k.c,
                      background: k.n === "1" && pressed ? GREEN : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 34,
                      fontWeight: 700,
                      transform: k.n === "1" ? `scale(${keyScale})` : undefined,
                    }}
                  >
                    {k.n}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, marginTop: 8, letterSpacing: "0.2em" }}>
                    {k.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CallScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const steps = [
    { at: 0.6, txt: "Twilio places a real outbound call — the phone on the table rings." },
    { at: 8.4, txt: "The human answers → StatusCallback → the screen flips to CONNECTED, live." },
    { at: 13.5, txt: "Gradium TTS speaks the brief: root cause, € impact, proposed fix." },
    { at: 20.8, txt: "Keypad decision — 1 GO · 2 ROLLBACK · 3 WAIT. Deterministic. No STT flakiness." },
  ];
  return (
    <Frame kicker="step 3 · it phones a human" step="real call · real approval">
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 110 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 34 }}>
          {steps.map((s, i) => (
            <Enter key={s.at} delay={s.at} y={18}>
              <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    border: `2.5px solid ${INK}`,
                    width: 52,
                    height: 52,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontSize: 36, lineHeight: 1.35, fontWeight: i === 3 ? 700 : 400 }}>{s.txt}</div>
              </div>
            </Enter>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Iphone t={t} />
        </div>
      </div>
    </Frame>
  );
};

// ————————————————————————————————————————————————————————— S7 · fix & verify —

const Fix: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const green = t > 7.4;
  const rows = [
    { at: 0.4, tag: "APPROVAL", color: GREEN, txt: 'human pressed 1 — "GO" · webhook → decision recorded' },
    { at: 2.2, tag: "FIX", color: AMBER, txt: "apply_fix(revert, abc123) → git revert → redeploy" },
    { at: 4.2, tag: "REPAIR", color: AMBER, txt: "POST /admin/repair on the real VM — 200 OK" },
    { at: 6.2, tag: "VERIFY", color: BLUE, txt: "live health poll until green — no fake checkmarks" },
  ];
  const err = interpolate(t, [6.6, 8.4], [41, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  return (
    <Frame kicker="step 4 · fix & verify" step="the € counter freezes">
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 100 }}>
        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 30 }}>
          {rows.map((r) => (
            <Enter key={r.tag} delay={r.at} y={16}>
              <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 21,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    color: r.color,
                    width: 190,
                  }}
                >
                  {r.tag}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 27 }}>{r.txt}</div>
              </div>
            </Enter>
          ))}
          <Enter delay={8.6}>
            <div style={{ fontSize: 58, fontWeight: 700, marginTop: 18 }}>
              <span style={{ color: GREEN }}>HTTP 200.</span> Incident resolved —{" "}
              <span style={{ color: MUTED }}>0 humans at a keyboard.</span>
            </div>
          </Enter>
        </div>
        <Enter delay={5.4} style={{ width: 560 }}>
          <Panel style={{ borderColor: green ? GREEN : RED }}>
            <div
              style={{
                borderBottom: `2px solid ${green ? GREEN : RED}`,
                padding: "16px 26px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Label size={19}>shop · live health</Label>
              <Label size={19} color={green ? GREEN : RED}>
                {green ? "▼ nominal" : "▲ critical"}
              </Label>
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1, padding: "20px 26px", borderRight: `2px solid ${INK}` }}>
                <Label size={17}>error rate</Label>
                <div style={{ fontFamily: MONO, fontSize: 62, fontWeight: 700, color: green ? GREEN : RED }}>
                  {err.toFixed(1)}%
                </div>
              </div>
              <div style={{ flex: 1, padding: "20px 26px" }}>
                <Label size={17}>€ lost · frozen</Label>
                <div style={{ fontFamily: MONO, fontSize: 62, fontWeight: 700 }}>€142</div>
              </div>
            </div>
          </Panel>
        </Enter>
      </div>
    </Frame>
  );
};

// ————————————————————————————————————————————————————————————— S8 · outro —

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: frame - 4.6 * fps, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: SANS, color: INK }}>
      <AbsoluteFill style={{ padding: "70px 90px" }}>
        <Enter delay={0.2} style={{ width: 900 }}>
          <Panel>
            <div style={{ borderBottom: `2px solid ${INK}`, padding: "14px 24px", display: "flex", justifyContent: "space-between" }}>
              <Label size={18} color={GREEN}>
                post-mortem · committed
              </Label>
              <Label size={18}>ed25519-signed</Label>
            </div>
            <div style={{ padding: "18px 26px", fontFamily: MONO, fontSize: 21, lineHeight: 1.75, color: MUTED }}>
              <div style={{ color: INK, fontWeight: 700 }}>docs/postmortems/inc-20260705.md</div>
              <div>root cause: commit abc123 · INVENTORY_SERVICE_URL → dead port</div>
              <div>resolution: revert → redeploy → verified &lt; 0.01 error rate</div>
              <div>citations: RB-01 § remediation · INC-2025-014 § root cause · sla.md</div>
            </div>
          </Panel>
        </Enter>
        <Enter delay={2.2}>
          <div style={{ marginTop: 40, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Chip>plans</Chip>
            <Chip>retrieves 3×</Chip>
            <Chip>7 tools</Chip>
            <Chip>decides</Chip>
            <Chip color={GREEN}>real call</Chip>
            <Chip color={GREEN}>real fix</Chip>
            <Chip color={GREEN}>real verify</Chip>
          </div>
        </Enter>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                width: 96,
                height: 96,
                background: INK,
                color: PAPER,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MONO,
                fontSize: 50,
                fontWeight: 700,
                transform: `scale(${Math.max(0.001, logo)})`,
                boxShadow: `10px 10px 0 0 ${GREEN}`,
              }}
            >
              M
            </div>
            <Enter delay={5.2}>
              <div style={{ fontSize: 74, fontWeight: 700, letterSpacing: -2, marginTop: 22 }}>
                Production in 2026 doesn't page a human.
              </div>
              <div style={{ fontSize: 74, fontWeight: 700, color: GREEN }}>It calls MAYDAY.</div>
            </Enter>
          </div>
          <Enter delay={6.4}>
            <div style={{ textAlign: "right" }}>
              <Label size={22}>raise summit 2026 · vultr track</Label>
              <div style={{ marginTop: 10 }}>
                <Label size={22} color={INK}>
                  vultr inference · bm25 docs-corpus · twilio · gradium
                </Label>
              </div>
            </div>
          </Enter>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ————————————————————————————————————————————————————————————————— video —

export const MaydayVideo: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Series>
      <Series.Sequence durationInFrames={S1 * FPS} premountFor={30}>
        <Title />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S2 * FPS} premountFor={30}>
        <Problem />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S3 * FPS} premountFor={30}>
        <Architecture />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S4 * FPS} premountFor={30}>
        <Break />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S5 * FPS} premountFor={30}>
        <AgentLoop />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S6 * FPS} premountFor={30}>
        <CallScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S7 * FPS} premountFor={30}>
        <Fix />
      </Series.Sequence>
      <Series.Sequence durationInFrames={S8 * FPS} premountFor={30}>
        <Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
