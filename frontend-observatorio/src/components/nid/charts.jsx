import { useEffect, useId, useRef, useState } from "react";

// ────────── glow resolver ──────────
function resolveGlow(glow) {
  if (glow === true)  return "hover";   // backward compat
  if (glow === false) return "off";
  if (!glow)          return "hover";   // default
  return glow;                          // "hover" | "always" | "off"
}

// ────────── helpers ──────────
const smoothPath = (pts) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const niceTicks = (min, max, count = 5) => {
  const span = max - min || 1;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const steps = [1, 2, 5, 10].map((m) => m * step0);
  const step = steps.find((s) => span / s <= count + 0.5) || step0 * 10;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + 0.0001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};

export const fmtMoneyShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}k`;
  return `R$ ${v}`;
};
export const fmtMoneyFull = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
export const fmtNumber = (v) => Number(v).toLocaleString("pt-BR");
export const fmtNumberShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return `${v}`;
};

function useContainerWidth(initial = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ────────── Sparkline (KPI cards) ──────────
export function Sparkline({ data, color = "var(--accent-1)", glow = "hover", height = 42, width = 240 }) {
  const id = useId().replace(/:/g, "");
  if (!data || data.length === 0) return null;
  const pad = 6;
  const ys = data;
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const sx = (i) => pad + (i / (ys.length - 1 || 1)) * (width - pad * 2);
  const sy = (y) => pad + (1 - (y - yMin) / (yMax - yMin || 1)) * (height - pad * 2);
  const pts = ys.map((y, i) => ({ x: sx(i), y: sy(y) }));
  const path = smoothPath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${path} L ${last.x} ${height} L ${first.x} ${height} Z`;
  // Sparklines are tiny — drop ghost glow path entirely for all glow modes
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={path} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ────────── AreaLineChart (PIB Evolution) ──────────
export function AreaLineChart({
  data, height = 280, glow = "hover", color = "var(--accent-1)",
  yFmt = fmtMoneyShort, tipFmt = fmtMoneyFull, label = "PIB Total",
  yCaption,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowAlways = glowMode === "always";
  const glowHover  = glowMode !== "off";

  const padL = 56, padR = 16, padT = 14, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const ys = data.map((d) => d.value);
  const yMax = Math.max(...ys) * 1.12;
  const ticks = niceTicks(0, yMax, yCaption ? 3 : 4);
  const tickFmt = yCaption ? fmtNumberShort : yFmt;
  const yScaleMax = ticks[ticks.length - 1];
  const sx = (i) => padL + (i / (data.length - 1 || 1)) * innerW;
  const sy = (v) => padT + (1 - v / yScaleMax) * innerH;

  const pts = data.map((d, i) => ({ x: sx(i), y: sy(d.value), v: d.value, label: d.label }));
  const path = smoothPath(pts);
  const area = `${path} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z`;

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0, bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  };

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="60%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeDasharray="3 4" />
            <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">{tickFmt(t)}</text>
          </g>
        ))}
        {yCaption && (
          <text className="axis-cap"
            x={14} y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle">
            {yCaption}
          </text>
        )}
        {data.map((d, i) =>
          (i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
            <text key={i} x={sx(i)} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
          )
        )}

        <path d={area} fill={`url(#area-${id})`} />
        {/* Resting glow halo: only when glowAlways */}
        {glowAlways && (
          <path d={path} stroke={color} strokeWidth="6" fill="none" opacity="0.5" filter={`url(#glow-${id})`} />
        )}
        <path d={path} stroke={color} strokeWidth="2.25" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {pts.map((p, i) => (
          <g key={i}>
            {/* Per-point glow halo: only on hovered point */}
            {glowHover && hover === i && (
              <circle cx={p.x} cy={p.y} r="8" fill={color} opacity="0.4" filter={`url(#glow-${id})`} />
            )}
            <circle cx={p.x} cy={p.y} r={hover === i ? 4.5 : 2.5} fill="var(--bg)" stroke={color} strokeWidth="2" />
          </g>
        ))}
        {hover != null && (
          <line x1={pts[hover].x} x2={pts[hover].x} y1={padT} y2={padT + innerH} stroke={color} strokeOpacity="0.4" strokeDasharray="2 3" />
        )}
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" onMouseMove={handleMove} />
      </svg>

      {hover != null && (
        <div className="nid-tip" style={{ left: `${(pts[hover].x / w) * 100}%`, top: `${(pts[hover].y / height) * 100}%` }}>
          <div className="tip-label">{pts[hover].label}</div>
          <div className="tip-row">
            <span className="name"><span className="swatch" style={{ background: color }}></span>{label}</span>
            <span>{tipFmt(pts[hover].v)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────── StackedBarChart ──────────
const opacityScale = (i) => {
  const stops = [0.95, 0.70, 0.45, 0.25, 0.15];
  return stops[i] ?? 0.10;
};

export function StackedBarChart({
  data, keys, colors, height = 280, glow = "hover",
  yFmt = fmtMoneyShort, tipFmt = fmtMoneyFull,
  yCaption,
  baseColor, showTotalLabel = false, highlightLast = false,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowHover  = glowMode !== "off";

  const resolvedColors = colors || [];
  const padL = 56, padR = 16, padT = 14, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const yMax = Math.max(...data.map((d) => keys.reduce((s, k) => s + (d[k] || 0), 0))) * 1.1;
  const ticks = niceTicks(0, yMax, yCaption ? 3 : 4);
  const tickFmt = yCaption ? fmtNumberShort : yFmt;
  const yScaleMax = ticks[ticks.length - 1];
  const barWidth = (innerW / data.length) * 0.55;
  const sx = (i) => padL + (innerW / data.length) * (i + 0.5);
  const sy = (v) => padT + (1 - v / yScaleMax) * innerH;

  // YoY delta helper for highlightLast
  const lastIdx = data.length - 1;
  const prevIdx = data.length - 2;
  const lastTotal = lastIdx >= 0 ? keys.reduce((s, k) => s + (data[lastIdx][k] || 0), 0) : 0;
  const prevTotal = prevIdx >= 0 ? keys.reduce((s, k) => s + (data[prevIdx][k] || 0), 0) : 0;
  const yoyPct = prevTotal > 0 ? ((lastTotal - prevTotal) / prevTotal) * 100 : null;

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          {!baseColor && resolvedColors.map((c, i) => (
            <filter key={i} id={`bglow-${id}-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          ))}
          {baseColor && (
            <filter id={`bglow-${id}-mono`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          )}
          {!baseColor && resolvedColors.map((c, i) => (
            <linearGradient key={i} id={`bgrad-${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.95" />
              <stop offset="100%" stopColor={c} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeDasharray="3 4" />
            <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">{tickFmt(t)}</text>
          </g>
        ))}
        {yCaption && (
          <text className="axis-cap"
            x={14} y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle">
            {yCaption}
          </text>
        )}
        {data.map((d, i) => {
          let acc = 0;
          const x = sx(i) - barWidth / 2;
          const isHover = hover === i;
          const isLast = i === lastIdx;
          const total = keys.reduce((s, k) => s + (d[k] || 0), 0);
          const top = sy(total);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {keys.map((k, ki) => {
                const v = d[k] || 0;
                const y0 = sy(acc + v);
                const y1 = sy(acc);
                acc += v;
                const isTop = ki === keys.length - 1;
                const segColor = baseColor || resolvedColors[ki];
                const fillAttr = baseColor
                  ? baseColor
                  : `url(#bgrad-${id}-${ki})`;
                const glowId = baseColor ? `bglow-${id}-mono` : `bglow-${id}-${ki}`;
                return (
                  <g key={k}>
                    {glowHover && isHover && (
                      <rect x={x - 2} y={y0 - 2} width={barWidth + 4} height={y1 - y0 + 4}
                        rx={isTop ? 6 : 0} fill={segColor} opacity="0.5" filter={`url(#${glowId})`} />
                    )}
                    <rect x={x} y={y0} width={barWidth} height={Math.max(0, y1 - y0)}
                      rx={isTop ? 5 : 0}
                      fill={fillAttr}
                      opacity={baseColor ? opacityScale(ki) : 1}
                      stroke={isTop ? segColor : "transparent"}
                      strokeWidth={isTop ? 1 : 0}
                      style={{ transition: "opacity 0.15s", opacity: baseColor ? (hover != null && hover !== i ? opacityScale(ki) * 0.4 : opacityScale(ki)) : (hover != null && hover !== i ? 0.35 : 1) }}
                    />
                  </g>
                );
              })}
              {showTotalLabel && (
                <text x={sx(i)} y={top - 8} className="nid-axis-text"
                  textAnchor="middle"
                  style={{
                    fill: highlightLast && isLast ? "var(--accent-2)" : "var(--text)",
                    fontWeight: highlightLast && isLast ? 700 : undefined,
                  }}>
                  {highlightLast && isLast && yoyPct != null
                    ? `${yFmt(total)} · ${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(0)}%`
                    : yFmt(total)}
                </text>
              )}
              {highlightLast && isLast && (
                <rect x={x - 2} y={top - 2}
                  width={barWidth + 4} height={padT + innerH - top + 4}
                  fill="none" stroke="var(--accent-2)" strokeWidth="1.5" rx="3" />
              )}
              <text x={sx(i)} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" />
      </svg>
      {hover != null && (
        <div className="nid-tip" style={{
          left: `${(sx(hover) / w) * 100}%`,
          top: `${(sy(keys.reduce((s, k) => s + (data[hover][k] || 0), 0)) / height) * 100}%`,
          transform: "translate(-50%, calc(-100% - 8px))",
        }}>
          <div className="tip-label">{data[hover].label}</div>
          {keys.map((k, ki) => {
            const swatchColor = baseColor || resolvedColors[ki];
            const swatchOpacity = baseColor ? opacityScale(ki) : 1;
            return (
              <div className="tip-row" key={k}>
                <span className="name">
                  <span className="swatch" style={{ background: swatchColor, opacity: swatchOpacity }}></span>{k}
                </span>
                <span>{tipFmt(data[hover][k] || 0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────── MultiLineChart (Comparativo) ──────────
export function MultiLineChart({
  data, series, colors, height = 280, glow = "hover",
  yFmt = fmtMoneyShort, tipFmt = fmtMoneyFull,
  yCaption,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowHover  = glowMode !== "off";

  const padL = 56, padR = 16, padT = 14, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const allVals = data.flatMap((d) => series.map((s) => d[s] || 0));
  const yMax = Math.max(...allVals) * 1.12;
  const ticks = niceTicks(0, yMax, yCaption ? 3 : 4);
  const tickFmt = yCaption ? fmtNumberShort : yFmt;
  const yScaleMax = ticks[ticks.length - 1];
  const sx = (i) => padL + (i / (data.length - 1 || 1)) * innerW;
  const sy = (v) => padT + (1 - v / yScaleMax) * innerH;
  const ptsBySeries = series.map((s) => data.map((d, i) => ({ x: sx(i), y: sy(d[s] || 0), v: d[s] || 0 })));

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(sx(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  };

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          {colors.map((c, i) => (
            <filter key={i} id={`mglow-${id}-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeDasharray="3 4" />
            <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">{tickFmt(t)}</text>
          </g>
        ))}
        {yCaption && (
          <text className="axis-cap"
            x={14} y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle">
            {yCaption}
          </text>
        )}
        {data.map((d, i) =>
          (i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
            <text key={i} x={sx(i)} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
          )
        )}
        {ptsBySeries.map((pts, si) => (
          <g key={si}>
            {/* No resting ghost path — flat by default */}
            <path d={smoothPath(pts)} stroke={colors[si]} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        ))}
        {hover != null && (
          <>
            <line x1={sx(hover)} x2={sx(hover)} y1={padT} y2={padT + innerH} stroke="var(--text-dim)" strokeOpacity="0.3" strokeDasharray="2 3" />
            {ptsBySeries.map((pts, si) => (
              <g key={si}>
                {/* Per-point glow halo: only on hovered point */}
                {glowHover && (
                  <circle cx={pts[hover].x} cy={pts[hover].y} r="8" fill={colors[si]} opacity="0.4" filter={`url(#mglow-${id}-${si})`} />
                )}
                <circle cx={pts[hover].x} cy={pts[hover].y} r="4" fill="var(--bg)" stroke={colors[si]} strokeWidth="2" />
              </g>
            ))}
          </>
        )}
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" onMouseMove={handleMove} />
      </svg>
      {hover != null && (
        <div className="nid-tip" style={{ left: `${(sx(hover) / w) * 100}%`, top: "10%" }}>
          <div className="tip-label">{data[hover].label}</div>
          {series.map((s, si) => (
            <div className="tip-row" key={s}>
              <span className="name"><span className="swatch" style={{ background: colors[si] }}></span>{s}</span>
              <span>{tipFmt(data[hover][s] || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────── TwinBarChart (CAGED) ──────────
export function TwinBarChart({
  data, height = 280, glow = "hover",
  colorUp = "var(--accent-5)", colorDown = "var(--accent-2)",
  yCaption,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowHover  = glowMode !== "off";

  const padL = 50, padR = 16, padT = 18, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const maxVal = Math.max(...data.flatMap((d) => [d.admissoes, d.desligamentos])) * 1.15;
  const ticks = niceTicks(0, maxVal, yCaption ? 3 : 4);
  const yScaleMax = ticks[ticks.length - 1];
  const slot = innerW / data.length;
  const barW = (slot * 0.7) / 2;
  const sxCenter = (i) => padL + slot * (i + 0.5);
  const sy = (v) => padT + (1 - v / yScaleMax) * innerH;

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <linearGradient id={`tup-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorUp} stopOpacity="0.95" />
            <stop offset="100%" stopColor={colorUp} stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`tdn-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorDown} stopOpacity="0.95" />
            <stop offset="100%" stopColor={colorDown} stopOpacity="0.4" />
          </linearGradient>
          <filter id={`tglow-${id}`}>
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeDasharray="3 4" />
            <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">{fmtNumberShort(t)}</text>
          </g>
        ))}
        {yCaption && (
          <text className="axis-cap"
            x={14} y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle">
            {yCaption}
          </text>
        )}
        {data.map((d, i) => {
          const cx = sxCenter(i);
          const xUp = cx - barW - 1;
          const xDn = cx + 1;
          const yUp = sy(d.admissoes);
          const yDn = sy(d.desligamentos);
          const hUp = padT + innerH - yUp;
          const hDn = padT + innerH - yDn;
          const isH = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {glowHover && isH && (
                <>
                  <rect x={xUp - 2} y={yUp - 2} width={barW + 4} height={hUp + 4} rx={5} fill={colorUp} opacity="0.6" filter={`url(#tglow-${id})`} />
                  <rect x={xDn - 2} y={yDn - 2} width={barW + 4} height={hDn + 4} rx={5} fill={colorDown} opacity="0.6" filter={`url(#tglow-${id})`} />
                </>
              )}
              <rect x={xUp} y={yUp} width={barW} height={hUp} rx={4}
                fill={`url(#tup-${id})`} stroke={colorUp} strokeWidth="1" opacity={hover != null && !isH ? 0.4 : 1} />
              <rect x={xDn} y={yDn} width={barW} height={hDn} rx={4}
                fill={`url(#tdn-${id})`} stroke={colorDown} strokeWidth="1" opacity={hover != null && !isH ? 0.4 : 1} />
              <text x={cx} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="nid-tip" style={{
          left: `${(sxCenter(hover) / w) * 100}%`,
          top: `${(Math.min(sy(data[hover].admissoes), sy(data[hover].desligamentos)) / height) * 100}%`,
          transform: "translate(-50%, calc(-100% - 8px))",
        }}>
          <div className="tip-label">{data[hover].label}</div>
          <div className="tip-row"><span className="name"><span className="swatch" style={{ background: colorUp }}></span>Admissões</span><span>{fmtNumber(data[hover].admissoes)}</span></div>
          <div className="tip-row"><span className="name"><span className="swatch" style={{ background: colorDown }}></span>Desligamentos</span><span>{fmtNumber(data[hover].desligamentos)}</span></div>
          <div className="tip-row" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
            <span className="name">Saldo</span>
            <span style={{ color: data[hover].admissoes - data[hover].desligamentos >= 0 ? "var(--accent-5)" : "var(--accent-2)" }}>
              {data[hover].admissoes - data[hover].desligamentos >= 0 ? "+" : ""}
              {fmtNumber(data[hover].admissoes - data[hover].desligamentos)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────── DonutChart ──────────
export function DonutChart({
  data, colors, height = 220, glow = "hover", centerLabel, centerSub,
}) {
  const id = useId().replace(/:/g, "");
  const [hoverSlice, setHoverSlice] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowAlways = glowMode === "always";
  const glowHover  = glowMode !== "off";
  const size = height;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.40;
  const r = size * 0.27;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const slices = data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x0 = cx + Math.cos(start) * R;
    const y0 = cy + Math.sin(start) * R;
    const x1 = cx + Math.cos(end) * R;
    const y1 = cy + Math.sin(end) * R;
    const xi0 = cx + Math.cos(start) * r;
    const yi0 = cy + Math.sin(start) * r;
    const xi1 = cx + Math.cos(end) * r;
    const yi1 = cy + Math.sin(end) * r;
    const path = `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`;
    return { ...d, path, color: colors[i % colors.length], pct: d.value / total };
  });
  return (
    <div className="nid-chart-wrap" style={{ display: "grid", placeItems: "center" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, width: size }}
        onMouseLeave={() => setHoverSlice(null)}>
        <defs>
          <filter id={`dglow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {slices.map((s, i) => (
          <g key={i} onMouseEnter={() => setHoverSlice(i)}>
            {/* Glow halo: always for glowAlways, or on hover for glowHover */}
            {(glowAlways || (glowHover && hoverSlice === i)) && (
              <path d={s.path} fill={s.color} opacity="0.45" filter={`url(#dglow-${id})`} />
            )}
            <path d={s.path} fill={s.color} stroke="var(--bg)" strokeWidth="2"
              opacity={hoverSlice != null && hoverSlice !== i ? 0.5 : 1} />
          </g>
        ))}
        {centerLabel && (
          <text x={cx} y={cy - 4} className="nid-donut-center">
            <tspan className="big" x={cx} dy="0">{centerLabel}</tspan>
            {centerSub && <tspan className="small" x={cx} dy="22">{centerSub}</tspan>}
          </text>
        )}
      </svg>
    </div>
  );
}

// ────────── Horizontal Bar (Ranking) ──────────
export function HBarChart({
  data, color = "var(--accent-1)", glow = "hover", height = 240, fmt = fmtMoneyFull,
}) {
  const id = useId().replace(/:/g, "");
  const [hoverRow, setHoverRow] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} />;
  const glowMode = resolveGlow(glow);
  const glowAlways = glowMode === "always";
  const glowHover  = glowMode !== "off";
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const rowH = (height - 8) / data.length;
  return (
    <div className="nid-chart-wrap" style={{ position: "relative", height }}
      onMouseLeave={() => setHoverRow(null)}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height, width: "100%" }}>
        <defs>
          <linearGradient id={`hb-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.7" />
            <stop offset="100%" stopColor={color} stopOpacity="0.25" />
          </linearGradient>
          <filter id={`hglow-${id}`}>
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>
        {data.map((d, i) => {
          const y = i * rowH + 5;
          const w = (d.value / max) * 100;
          const isH = hoverRow === i;
          const showGlow = glowAlways || (glowHover && isH);
          return (
            <g key={i} onMouseEnter={() => setHoverRow(i)}>
              <rect x="0" y={y} width="100" height={rowH - 10} rx="3" fill="var(--panel-2)" />
              {showGlow && (
                <rect x="0" y={y - 1} width={w} height={rowH - 8} rx="3" fill={color} opacity="0.6" filter={`url(#hglow-${id})`} />
              )}
              <rect x="0" y={y} width={w} height={rowH - 10} rx="3" fill={`url(#hb-${id})`} stroke={color} strokeWidth="0.3"
                opacity={hoverRow != null && !isH ? 0.5 : 1} />
            </g>
          );
        })}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        justifyContent: "space-around", padding: "5px 12px", pointerEvents: "none",
      }}>
        {data.map((d, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600,
          }}>
            <span style={{ color: "var(--text)" }}>{d.label}</span>
            <span style={{ color: "var(--text-dim)" }}>{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ h = 240 }) {
  return (
    <div style={{
      height: h, display: "grid", placeItems: "center",
      color: "var(--text-mute)", fontSize: 13, fontFamily: "var(--font-mono)",
    }}>
      Sem dados disponíveis
    </div>
  );
}
