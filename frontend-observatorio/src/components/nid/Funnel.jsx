import { useId, useState } from "react";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute conversion % relative to the previous stage.
 * Stage 0 (the widest / first stage) returns null — it has no prior stage
 * to compare against.
 *
 * Example: lead=24, contato=18 → contato conversion = 18/24 = 75%
 */
function conversionRate(stages, index) {
  if (index === 0) return null;
  const prev = stages[index - 1].value;
  if (!prev) return null;
  return Math.round((stages[index].value / prev) * 100);
}

// ─── funnel geometry helpers ──────────────────────────────────────────────────

/**
 * Returns the four corners of a trapezoid for stage[i].
 *
 * Layout:
 *   - Each stage occupies an equal height slice.
 *   - The top-width of stage[i] == bottom-width of stage[i-1] (continuous).
 *   - Stage widths scale by value/maxValue, centred horizontally.
 *   - A minimum width ratio (MIN_W) prevents stages from disappearing at 0.
 */
function trapezoidPath(topW, bottomW, cx, y, h) {
  const tl = cx - topW / 2;
  const tr = cx + topW / 2;
  const bl = cx - bottomW / 2;
  const br = cx + bottomW / 2;
  return `M ${tl} ${y} L ${tr} ${y} L ${br} ${y + h} L ${bl} ${y + h} Z`;
}

// ─── NidFunnel ────────────────────────────────────────────────────────────────

/**
 * NidFunnel — pure-SVG funnel chart with an optional kanban-list view toggle.
 *
 * Props
 * ─────
 * stages          Array<{ key, label, value, color? }>   required
 * view            "funnel" | "list"                       default "funnel"
 * onViewChange    (view: string) => void                  optional
 * showConversion  boolean                                 default true
 * height          number (SVG height in px)               default 320
 * glow            "hover" | "always" | "off"              default "hover"
 *
 * Conversion math
 * ───────────────
 * Each stage's conversion % is computed vs. the immediately preceding stage
 * (stage-over-stage, not vs. the first stage). Stage 0 shows no conversion %.
 */
export default function NidFunnel({
  stages = [],
  view = "funnel",
  onViewChange,
  showConversion = true,
  height = 320,
  glow = "hover",
}) {
  const uid = useId().replace(/:/g, "");
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [internalView, setInternalView] = useState(view);

  // Allow controlled or uncontrolled view mode
  const activeView = onViewChange ? view : internalView;
  function switchView(v) {
    if (onViewChange) {
      onViewChange(v);
    } else {
      setInternalView(v);
    }
  }

  if (!stages || stages.length === 0) return null;

  const glowMode = glow === true ? "hover" : glow === false ? "off" : glow || "hover";
  const glowOnHover = glowMode !== "off";

  // ── SVG layout constants ─────────────────────────────────────────────────
  const PAD_LEFT   = 16;
  const PAD_RIGHT  = 200; // room for label + value on the right
  const PAD_TOP    = 16;
  const PAD_BOTTOM = 16;
  const GAP        = 4;   // vertical gap between trapezoids
  const MIN_W      = 0.15; // minimum width ratio for the smallest stage

  // We'll use a container-width observer pattern similar to charts.jsx.
  // For SSR compatibility we start with a sensible default; the SVG uses
  // viewBox so it scales correctly at any container width.
  const SVG_W = 600;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const funnelW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const cx = PAD_LEFT + funnelW / 2;

  const maxVal = Math.max(...stages.map((s) => s.value), 1);
  const stageH = (innerH - GAP * (stages.length - 1)) / stages.length;

  // Compute width for each stage
  const stageWidths = stages.map((s) => {
    const ratio = MIN_W + (1 - MIN_W) * (s.value / maxVal);
    return ratio * funnelW;
  });

  // ── Funnel view ──────────────────────────────────────────────────────────
  const funnelContent = (
    <svg
      className="nid-funnel__svg"
      viewBox={`0 0 ${SVG_W} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ height }}
      aria-label="Funil de estágios"
      role="img"
    >
      <defs>
        <filter id={`nf-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {stages.map((stage, i) => {
        const topW    = stageWidths[i];
        const bottomW = i < stages.length - 1 ? stageWidths[i + 1] : stageWidths[i] * 0.85;
        const y       = PAD_TOP + i * (stageH + GAP);
        const path    = trapezoidPath(topW, bottomW, cx, y, stageH);
        const color   = stage.color || "var(--accent-1)";
        const isHov   = hoveredIdx === i;
        const conv    = showConversion ? conversionRate(stages, i) : null;

        // Label/value positioned to the right of the widest possible trapezoid
        const labelX = PAD_LEFT + funnelW + 14;
        const midY   = y + stageH / 2;

        return (
          <g
            key={stage.key ?? i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ cursor: "default" }}
          >
            {/* Glow halo on hover */}
            {glowOnHover && isHov && (
              <path
                d={path}
                fill={color}
                opacity="0.25"
                filter={`url(#nf-glow-${uid})`}
                style={{ pointerEvents: "none" }}
              />
            )}

            {/* Main trapezoid */}
            <path
              d={path}
              fill={color}
              opacity={isHov ? 1 : 0.82}
              style={{ transition: "opacity 0.15s" }}
            />

            {/* Subtle top highlight */}
            <path
              d={`M ${cx - topW / 2} ${y} L ${cx + topW / 2} ${y}`}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
              fill="none"
              style={{ pointerEvents: "none" }}
            />

            {/* Stage label */}
            <text
              x={labelX}
              y={midY - (conv !== null ? 10 : 4)}
              className="nid-funnel__stage-label"
            >
              {stage.label}
            </text>

            {/* Stage value */}
            <text
              x={labelX}
              y={midY + 9}
              className="nid-funnel__stage-value"
            >
              {stage.value}
            </text>

            {/* Conversion rate */}
            {conv !== null && (
              <text
                x={labelX}
                y={midY + 22}
                className="nid-funnel__stage-conv"
              >
                {conv}% conv.
              </text>
            )}

            {/* Connector line from trapezoid to label */}
            <line
              x1={cx + topW / 2 + 2}
              y1={midY}
              x2={labelX - 6}
              y2={midY}
              stroke={color}
              strokeWidth="1"
              opacity="0.35"
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}
    </svg>
  );

  // ── List (kanban) view ───────────────────────────────────────────────────
  const listContent = (
    <div className="nid-funnel-list">
      {stages.map((stage, i) => {
        const color = stage.color || "var(--accent-1)";
        const conv  = showConversion ? conversionRate(stages, i) : null;
        const pct   = Math.round((stage.value / maxVal) * 100);
        return (
          <div
            key={stage.key ?? i}
            className="nid-funnel-list__card"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              borderColor: hoveredIdx === i
                ? color
                : "var(--border)",
              transition: "border-color 0.15s",
            }}
          >
            <div
              className="nid-funnel-list__label"
              style={{ color: hoveredIdx === i ? color : "var(--text-mute)" }}
            >
              {stage.label}
            </div>
            <div className="nid-funnel-list__value">{stage.value}</div>
            {conv !== null && (
              <div className="nid-funnel-list__conv">{conv}% conv.</div>
            )}
            <div className="nid-funnel-list__bar">
              <div
                className="nid-funnel-list__bar-fill"
                style={{
                  width: `${pct}%`,
                  background: color,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Toggle button ────────────────────────────────────────────────────────
  const toggle = (
    <div className="nid-funnel__toggle" aria-label="Alternar visualização">
      {["funnel", "list"].map((v) => (
        <button
          key={v}
          onClick={() => switchView(v)}
          className={`nid-funnel__toggle-btn${activeView === v ? " is-active" : ""}`}
          title={v === "funnel" ? "Visão em funil" : "Visão em lista"}
          type="button"
        >
          {v === "funnel" ? (
            // Simple trapezoid icon
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1 2h12l-3 10H4L1 2z" opacity="0.9" />
            </svg>
          ) : (
            // Simple grid icon
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="5" height="5" rx="1" />
              <rect x="8" y="1" width="5" height="5" rx="1" />
              <rect x="1" y="8" width="5" height="5" rx="1" />
              <rect x="8" y="8" width="5" height="5" rx="1" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="nid-funnel">
      {toggle}
      {activeView === "funnel" ? funnelContent : listContent}
    </div>
  );
}
