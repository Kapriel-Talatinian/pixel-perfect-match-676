import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

const grotesk = loadGrotesk("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

export const SANS = grotesk.fontFamily;
export const MONO = mono.fontFamily;

export const INK = "#141414";
export const PAPER = "#ffffff";
export const MUTED = "#6f6f6f";
export const FAINT = "#f4f4f4";
export const GREEN = "#2e7d43";
export const RED = "#b3261e";
export const AMBER = "#8a6a1f";
export const BLUE = "#2c4fd8";

// Small helpers -----------------------------------------------------------

export const Enter: React.FC<{
  delay?: number; // seconds
  children: React.ReactNode;
  y?: number;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, y = 24, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay * fps, fps, config: { damping: 200 }, durationInFrames: 22 });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>
      {children}
    </div>
  );
};

export const FadeOutAll: React.FC<{ start: number; children: React.ReactNode }> = ({
  start,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [start * fps, start * fps + 15], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, position: "absolute", inset: 0 }}>{children}</div>;
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({
  children,
  color = MUTED,
  size = 22,
}) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: size,
      letterSpacing: "0.3em",
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div style={{ background: PAPER, border: `2px solid ${INK}`, ...style }}>{children}</div>
);

export const Chip: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = INK,
}) => (
  <span
    style={{
      fontFamily: MONO,
      fontSize: 19,
      border: `1.5px solid ${color}`,
      color,
      padding: "4px 10px",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

// Typewriter driven by frames
export const useTyped = (text: string, startSec: number, cps = 40) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Math.max(0, Math.floor(((frame - startSec * fps) / fps) * cps));
  return text.slice(0, chars);
};
