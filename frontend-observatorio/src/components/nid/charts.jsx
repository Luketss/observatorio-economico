import { useEffect, useId, useRef, useState } from "react";
import React from "react";
import ChartState from "./ChartState.jsx";
import { useChartHover } from "./ChartHoverContext.jsx";
import { viewBoxXFromOverlay, nearestIndexByX } from "../../utils/chartHover.js";
import { niceTicks, yBounds } from "../../utils/chartScale.js";

// ────────── glow resolver ──────────
function resolveGlow(glow) {
  if (glow === true)  return "hover";   // backward compat
  if (glow === false) return "off";
  if (!glow)          return "hover";   // default
  return glow;                          // "hover" | "always" | "off"
}

// ────────── x-axis label thinning ──────────
// Width-aware: fit roughly one label per 64px of chart width (so narrow/mobile
// viewports thin out more aggressively and labels don't overlap), always
// keeping the first and last. Falls back to ~12 labels when width is unknown.
function shouldShowXLabel(i, total, width) {
  const maxLabels = width ? Math.max(3, Math.floor(width / 64)) : 12;
  if (total <= maxLabels) return true;
  const stride = Math.ceil(total / maxLabels);
  return i % stride === 0 || i === total - 1;
}

// ────────── linear forecast (ticket 04) ──────────
function linearForecast(values, steps = 1, n = 6) {
  const tail = values.slice(-n);
  const N = tail.length;
  if (N < 2) return [];
  const xMean = (N - 1) / 2;
  const yMean = tail.reduce((s, v) => s + v, 0) / N;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    num += (i - xMean) * (tail[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const out = [];
  for (let i = 1; i <= steps; i++) out.push(intercept + slope * (N - 1 + i));
  return out;
}

// Parse "linear-N" method string → N points used for regression
function parseN(method) {
  if (!method) return 6;
  const m = String(method).match(/linear-(\d+)/);
  return m ? parseInt(m[1], 10) : 6;
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

// Quebra a série em trechos contíguos: `null` é ano sem dado, não zero. Sem
// isso a linha desceria até o eixo e desenharia um tombo que não aconteceu.
// Exportado pra testar puro (sem DOM) — mesmo padrão de fmtMoneyShort e
// companhia logo abaixo, por isso o mesmo eslint-disable delas se aplicaria
// aqui; como elas não o usam, mantemos consistência silenciando só esta linha.
// eslint-disable-next-line react-refresh/only-export-components
export const trechos = (pts) => {
  const out = [];
  let atual = [];
  for (const p of pts) {
    if (p) atual.push(p);
    else if (atual.length) { out.push(atual); atual = []; }
  }
  if (atual.length) out.push(atual);
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
// COMEX é USD — formatar como R$ replicaria o erro da tela de ranking antiga.
export const fmtUsdShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `US$ ${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `US$ ${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `US$ ${(v / 1e3).toFixed(0)}k`;
  return `US$ ${v}`;
};
export const fmtUsdFull = (v) =>
  `US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
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

// ────────── Declarative annotation shadow components (ticket 15) ──────────
// These components return null — they exist only to be detected by
// React.Children.forEach inside AreaLineChart / MultiLineChart.
export function Annotation(props) { return null; }        // point callout: x, kind, children(label)
export function AnnotationBand(props) { return null; }    // range band: xRange, kind
export function Benchmark(props) { return null; }         // horizontal ref line: value, label, color

/**
 * Partitions React children into the three annotation buckets.
 * Each bucket item is the child's props object (plus `label` normalized
 * from React children text when the child has text content).
 */
function partitionChildren(children) {
  const annotations = [], bands = [], benchmarks = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === Annotation) {
      // Normalize: label comes from children text if not set as prop
      const label = child.props.label ?? (typeof child.props.children === "string" ? child.props.children : undefined);
      annotations.push({ ...child.props, label });
    } else if (child.type === AnnotationBand) {
      bands.push(child.props);
    } else if (child.type === Benchmark) {
      benchmarks.push(child.props);
    }
  });
  return { annotations, bands, benchmarks };
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
  benchmark,    // { value, label, color? }  — array-form (ticket 04)
  forecast,     // { steps, method, color?, label? }
  annotations,  // [{ x, kind, label? } | { xRange:[x1,x2], kind }]  — array-form (ticket 04)
  children,     // declarative <Annotation/>, <AnnotationBand/>, <Benchmark/> (ticket 15)
  loading,
  emptyMessage,
  emptyAction,
  syncGroup,    // ticket 14: cross-chart hover sync
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [localHover, setLocalHover] = useState(null);
  const [externalLabel, setExternalLabel] = useChartHover(syncGroup);

  // Resolve external label → index in data (real points only)
  const externalIdx =
    externalLabel != null && data
      ? data.findIndex((d) => String(d.label) === String(externalLabel))
      : -1;

  // Local hover wins; fall back to external
  const hover = localHover ?? (externalIdx >= 0 ? externalIdx : null);
  const isExternalHover = localHover == null && externalIdx >= 0;

  // Broadcast local hover changes to siblings
  useEffect(() => {
    if (!syncGroup || !data) return;
    setExternalLabel(localHover != null ? data[localHover]?.label ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHover, syncGroup]);
  if (loading) return <ChartState kind="loading" shape="line" height={height} />;
  if (!data || data.length === 0) return <EmptyChart h={height} shape="line" message={emptyMessage} action={emptyAction} />;
  const glowMode = resolveGlow(glow);
  const glowAlways = glowMode === "always";
  const glowHover  = glowMode !== "off";

  // ── ticket 15: merge declarative children with array-form props ───────────
  const { annotations: childAnnotations, bands: childBands, benchmarks: childBenchmarks } = partitionChildren(children);
  // Point annotations: array-form first, then child-form (xRange items are bands)
  const allAnnotations = [
    ...(annotations || []),
    ...childAnnotations.map((a) => ({ x: a.x, kind: a.kind, label: a.label })),
    ...childBands.map((b) => ({ xRange: b.xRange, kind: b.kind })),
  ];
  // Benchmark: array-form wins; if not set, use first declarative <Benchmark>
  const resolvedBenchmark = benchmark ?? (childBenchmarks.length > 0 ? childBenchmarks[0] : undefined);

  const padL = 56, padR = 16, padT = 14, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  // ── forecast values ──────────────────────────────────────────────────────
  const forecastSteps  = forecast?.steps  ?? 1;
  const forecastN      = parseN(forecast?.method);
  const forecastColor  = forecast?.color  || "var(--accent-3)";
  const forecastLabel  = forecast?.label  || "projeção";
  const forecastVals   = forecast ? linearForecast(data.map((d) => d.value), forecastSteps, forecastN) : [];

  // Extended x domain: real labels + projected labels
  const lastLabel = data[data.length - 1]?.label ?? "";
  const projLabels = forecastVals.map((_, i) => {
    // Try to make a "next period" label.  If label is a 4-digit year, increment it.
    const base = parseInt(lastLabel, 10);
    const suffix = "P";
    return isNaN(base) ? `${lastLabel}+${i + 1}${suffix}` : `${base + i + 1} ${suffix}`;
  });
  const allLabels  = [...data.map((d) => d.label), ...projLabels];
  const totalPts   = allLabels.length;

  // ── Y scale (expand for benchmark / forecast; negativos estendem o
  // domínio para baixo — saldo CAGED cruza zero) ────────────────────────
  const ys = data.map((d) => d.value);
  const allYs = [...ys, ...forecastVals, ...(resolvedBenchmark?.value != null ? [resolvedBenchmark.value] : [])];
  const { lo: yLoRaw, hi: yHiRaw } = yBounds(allYs);
  const ticks = niceTicks(yLoRaw, yHiRaw, yCaption ? 3 : 4);
  const tickFmt = yCaption ? fmtNumberShort : yFmt;
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];

  // ── Coordinate mappers ────────────────────────────────────────────────
  // sx maps a global index over allLabels
  const sx = (i) => padL + (i / (totalPts - 1 || 1)) * innerW;
  const sy = (v) => padT + (1 - (v - yLo) / (yHi - yLo || 1)) * innerH;

  // Real points (indices 0..data.length-1)
  const pts = data.map((d, i) => ({ x: sx(i), y: sy(d.value), v: d.value, label: d.label, isForecast: false }));
  // Forecast points (indices data.length..totalPts-1)
  const fcPts = forecastVals.map((v, i) => ({
    x: sx(data.length + i),
    y: sy(v),
    v,
    label: projLabels[i],
    isForecast: true,
  }));

  const path = smoothPath(pts);
  // Área fecha na linha do zero (== fundo do plot quando a série é toda positiva)
  const baseY = sy(0);
  const area = `${path} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;

  // All hoverable points (real + forecast)
  const allPts = [...pts, ...fcPts];

  const handleMove = (e) => {
    const px = viewBoxXFromOverlay(e.clientX, e.currentTarget.getBoundingClientRect(), padL, innerW);
    setLocalHover(nearestIndexByX(allPts.map((p) => p.x), px));
  };

  const hoveredPt = hover != null ? allPts[hover] : null;

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setLocalHover(null)}>
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
        {/* X-axis labels — show every ~10th real label + all forecast labels */}
        {allLabels.map((lbl, i) => {
          const isReal = i < data.length;
          if (isReal && !shouldShowXLabel(i, data.length, w)) return null;
          return (
            <text key={i} x={sx(i)} y={height - padB + 18}
              className="nid-axis-text" textAnchor="middle"
              style={!isReal ? { fill: forecastColor } : undefined}>
              {lbl}
            </text>
          );
        })}

        {/* ── Range annotations (behind everything) ── */}
        {allAnnotations.filter((a) => a.xRange).map((a, i) => {
          const i0 = data.findIndex((d) => d.label === a.xRange[0]);
          const i1 = data.findIndex((d) => d.label === a.xRange[1]);
          if (i0 < 0 || i1 < 0) return null;
          const fill   = a.kind === "negative" ? "rgba(255,61,146,.06)" : "rgba(0,229,255,.06)";
          const stroke = a.kind === "negative" ? "rgba(255,61,146,.15)" : "rgba(0,229,255,.15)";
          return (
            <rect key={`band-${i}`}
              x={pts[i0].x} y={padT}
              width={pts[i1].x - pts[i0].x}
              height={innerH}
              fill={fill} stroke={stroke} />
          );
        })}

        <path d={area} fill={`url(#area-${id})`} />
        {/* Resting glow halo: only when glowAlways */}
        {glowAlways && (
          <path d={path} stroke={color} strokeWidth="6" fill="none" opacity="0.5" filter={`url(#glow-${id})`} />
        )}
        <path d={path} stroke={color} strokeWidth="2.25" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* ── Forecast path ── */}
        {forecast && fcPts.length > 0 && (
          <path
            d={`M ${pts[pts.length - 1].x} ${pts[pts.length - 1].y} L ${fcPts.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
            stroke={forecastColor} strokeWidth="2" strokeDasharray="3 4" fill="none" opacity="0.9"
          />
        )}

        {/* ── Benchmark line ── */}
        {resolvedBenchmark && (
          <g>
            <line
              x1={padL} x2={w - padR}
              y1={sy(resolvedBenchmark.value)} y2={sy(resolvedBenchmark.value)}
              stroke={resolvedBenchmark.color || "var(--text-dim)"}
              strokeDasharray="6 5" strokeWidth="1.2" opacity="0.55"
            />
            <text
              x={w - padR} y={sy(resolvedBenchmark.value) - 5}
              textAnchor="end"
              className="nid-axis-text"
              style={{ fill: resolvedBenchmark.color || "var(--text-dim)", letterSpacing: ".06em" }}
            >
              {resolvedBenchmark.label} · {tipFmt(resolvedBenchmark.value)}
            </text>
          </g>
        )}

        {/* ── Real data dots ── */}
        {pts.map((p, i) => (
          <g key={i}>
            {glowHover && hover === i && (
              <circle cx={p.x} cy={p.y} r="8" fill={color} opacity="0.4" filter={`url(#glow-${id})`} />
            )}
            <circle cx={p.x} cy={p.y} r={hover === i ? 4.5 : 2.5} fill="var(--bg)" stroke={color} strokeWidth="2" />
          </g>
        ))}

        {/* ── Forecast dots ── */}
        {fcPts.map((p, i) => (
          <g key={`fc-${i}`}>
            {glowHover && hover === (pts.length + i) && (
              <circle cx={p.x} cy={p.y} r="8" fill={forecastColor} opacity="0.4" filter={`url(#glow-${id})`} />
            )}
            <circle cx={p.x} cy={p.y}
              r={hover === (pts.length + i) ? 4.5 : 3}
              fill="var(--bg)" stroke={forecastColor} strokeWidth="2" strokeDasharray="2 2" />
          </g>
        ))}

        {/* Crosshair — dimmer when driven by an external sync peer */}
        {hoveredPt && (
          <line x1={hoveredPt.x} x2={hoveredPt.x} y1={padT} y2={padT + innerH}
            stroke={hoveredPt.isForecast ? forecastColor : color}
            strokeOpacity={isExternalHover ? 0.2 : 0.4}
            strokeDasharray={isExternalHover ? "3 5" : "2 3"} />
        )}

        {/* ── Point annotations (on top of lines) ── */}
        {allAnnotations.filter((a) => a.x != null).map((a, i) => {
          const idx = data.findIndex((d) => d.label === a.x);
          if (idx < 0) return null;
          const p = pts[idx];
          const fill = a.kind === "negative" ? "var(--accent-2)"
                     : a.kind === "positive" ? "var(--accent-5)"
                     : "var(--accent-1)";
          return (
            <g key={`ann-${i}`}>
              <circle cx={p.x} cy={p.y} r="5" fill="var(--bg)" stroke={fill} strokeWidth="2" />
              {a.label && (
                <foreignObject x={p.x - 60} y={p.y - 38} width="120" height="22">
                  <div xmlns="http://www.w3.org/1999/xhtml" className={`nid-pin${a.kind ? ` ${a.kind}` : ""}`}>
                    {a.label}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" onMouseMove={handleMove} />
      </svg>

      {hoveredPt && (
        <div
          className="nid-tip"
          style={{
            left: `${(hoveredPt.x / w) * 100}%`,
            // External hover: anchor to top of chart area; local hover: follow the point
            top: isExternalHover
              ? `${((padT + 8) / height) * 100}%`
              : `${(hoveredPt.y / height) * 100}%`,
            opacity: isExternalHover ? 0.75 : 1,
          }}
        >
          <div className="tip-label">{hoveredPt.label}</div>
          {hoveredPt.isForecast ? (
            <>
              <div className="tip-row">
                <span className="name"><span className="swatch" style={{ background: forecastColor }}></span>{forecastLabel.toUpperCase()}</span>
                <span>{tipFmt(hoveredPt.v)}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-mute)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                regressão linear, {forecastN} pts
              </div>
            </>
          ) : (
            <div className="tip-row">
              <span className="name"><span className="swatch" style={{ background: color }}></span>{label}</span>
              <span>{tipFmt(hoveredPt.v)}</span>
            </div>
          )}
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

// Legenda inline (swatch + nome) para gráficos multi-série. `max` recorta a
// lista pra um tamanho fixo — restrição do projeto: cortar dado sem avisar é
// descarte silencioso, então o corte vem com um chip "+N séries".
function InlineLegend({ items, max }) {
  if (!items || items.length === 0) return null;
  const mostrados = max ? items.slice(0, max) : items;
  const ocultos = items.length - mostrados.length;
  const swatch = (it) => {
    if (it.kind === "dash")
      return { width: 14, height: 0, borderTop: `2px dashed ${it.color}`, borderRadius: 0 };
    if (it.kind === "band")
      return { width: 14, height: 10, background: it.color, borderRadius: 2, opacity: 0.5 };
    return { width: 10, height: 10, background: it.color, borderRadius: 3 };
  };
  return (
    <ul
      style={{
        listStyle: "none", margin: "12px 0 0", padding: 0, width: "100%",
        display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center",
      }}
    >
      {mostrados.map((it, i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
          <span style={{ ...swatch(it), flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap" }}>{it.name}</span>
        </li>
      ))}
      {/* Truncar sim, truncar calado não. */}
      {ocultos > 0 && (
        <li style={{ fontSize: 12, color: "var(--text-mute)", whiteSpace: "nowrap" }}>
          +{ocultos} séries
        </li>
      )}
    </ul>
  );
}

export function StackedBarChart({
  data, keys, colors, height = 280, glow = "hover",
  yFmt = fmtMoneyShort, tipFmt = fmtMoneyFull,
  yCaption,
  baseColor, showTotalLabel = false, highlightLast = false,
  legend = false,
  loading,
  emptyMessage,
  emptyAction,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [hover, setHover] = useState(null);
  if (loading) return <ChartState kind="loading" shape="stacked" height={height} />;
  if (!data || data.length === 0) return <EmptyChart h={height} shape="stacked" message={emptyMessage} action={emptyAction} />;
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
              {shouldShowXLabel(i, data.length, w) && (
                <text x={sx(i)} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
              )}
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
      {legend && (
        <InlineLegend items={keys.map((k, i) => ({ name: k, color: baseColor || resolvedColors[i % (resolvedColors.length || 1)] }))} />
      )}
    </div>
  );
}

// ────────── MultiLineChart (Comparativo) ──────────
export function MultiLineChart({
  data, series, colors, height = 280, glow = "hover",
  yFmt = fmtMoneyShort, tipFmt = fmtMoneyFull,
  yCaption,
  benchmark,    // { value, label, color? }  — array-form (ticket 04)
  forecast,     // { steps, method, color?, label? } — applied to ALL series; draws one band per series
  annotations,  // [{ x, kind, label? } | { xRange:[x1,x2], kind }]  — array-form (ticket 04)
  children,     // declarative <Annotation/>, <AnnotationBand/>, <Benchmark/> (ticket 15)
  // ── focus + context (ticket 06) ──────────────────────────────────────────
  focusSeries,  // string — when set, switches to focus+context mode
  focusColor,   // defaults to var(--accent-2)
  showMedian,   // boolean — draw dashed peer-median line
  showBand,     // boolean — draw peer min/max band
  legend = false, // render an inline series legend below the chart
  pinnedSeries = [],   // séries que o usuário fixou: cor própria, não são "contexto"
  legendMax = 8,       // teto da legenda fora do modo foco
  peerCount,           // nº de pares por trás da mediana/faixa (default: séries de par)
  loading,
  emptyMessage,
  emptyAction,
  syncGroup,    // ticket 14: cross-chart hover sync
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [localHover, setLocalHover] = useState(null);
  const [hoverSeries, setHoverSeries] = useState(null);
  const [externalLabel, setExternalLabel] = useChartHover(syncGroup);

  const externalIdx =
    externalLabel != null && data
      ? data.findIndex((d) => String(d.label) === String(externalLabel))
      : -1;

  const hover = localHover ?? (externalIdx >= 0 ? externalIdx : null);
  const isExternalHover = localHover == null && externalIdx >= 0;

  useEffect(() => {
    if (!syncGroup || !data) return;
    setExternalLabel(localHover != null ? data[localHover]?.label ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHover, syncGroup]);

  if (loading) return <ChartState kind="loading" shape="line" height={height} />;
  if (!data || data.length === 0) return <EmptyChart h={height} shape="line" message={emptyMessage} action={emptyAction} />;
  const glowMode = resolveGlow(glow);
  const glowHover  = glowMode !== "off";

  // ── ticket 15: merge declarative children with array-form props ───────────
  const { annotations: childAnnotations, bands: childBands, benchmarks: childBenchmarks } = partitionChildren(children);
  const allAnnotations = [
    ...(annotations || []),
    ...childAnnotations.map((a) => ({ x: a.x, kind: a.kind, label: a.label })),
    ...childBands.map((b) => ({ xRange: b.xRange, kind: b.kind })),
  ];
  const resolvedBenchmark = benchmark ?? (childBenchmarks.length > 0 ? childBenchmarks[0] : undefined);

  // ── focus + context helpers ──────────────────────────────────────────────
  const focusMode = !!focusSeries;
  const resolvedFocusColor = focusColor || "var(--accent-2)";
  // focusIdx may be -1 if focusSeries is not in series array — graceful fallback
  const focusIdx = focusMode ? series.indexOf(focusSeries) : -1;
  // Séries que o usuário fixou (ex.: escolheu comparar com um par específico)
  // ganham cor própria — não são "contexto esmaecido" como o resto dos pares.
  const pinned = new Set(pinnedSeries || []);

  const colorFor = (si) => {
    if (!focusMode) return (colors || [])[si] || "var(--accent-1)";
    if (si === focusIdx) return resolvedFocusColor;
    if (pinned.has(series[si])) return (colors || [])[si] || "var(--accent-1)";
    // Token de tema (não literal): o azul translúcido calibrado pro fundo
    // escuro ficava quase invisível no tema claro (~15% de alfa efetivo
    // depois da opacity 0.55 do render) — ver --serie-contexto em themes.css.
    return "var(--serie-contexto)";
  };

  const strokeFor = (si, isHovered) => {
    if (!focusMode) return 2;
    if (si === focusIdx) return 2.5;
    if (pinned.has(series[si])) return 2;
    return isHovered ? 1.8 : 1.2;
  };

  // Widen right padding when focus label is painted at line end
  const padL = 56, padR = focusMode ? 80 : 16, padT = 14, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  // ── forecast per series ──────────────────────────────────────────────────
  const forecastSteps = forecast?.steps ?? 1;
  const forecastN     = parseN(forecast?.method);
  const forecastColor = forecast?.color || "var(--accent-3)";
  const forecastLabel = forecast?.label || "projeção";
  // one forecast array per series
  const forecastValsBySeries = forecast
    ? series.map((s) => linearForecast(data.map((d) => d[s] || 0), forecastSteps, forecastN))
    : series.map(() => []);
  const hasForecast = forecast && forecastValsBySeries.some((fc) => fc.length > 0);

  // Extended x domain
  const lastLabel = data[data.length - 1]?.label ?? "";
  const projLabels = hasForecast
    ? forecastValsBySeries[0].map((_, i) => {
        const base = parseInt(lastLabel, 10);
        return isNaN(base) ? `${lastLabel}+${i + 1}P` : `${base + i + 1} P`;
      })
    : [];
  const allLabels = [...data.map((d) => d.label), ...projLabels];
  const totalPts  = allLabels.length;

  // ── Y scale (expand for benchmark / forecast; negativos estendem o
  // domínio para baixo — saldo CAGED cruza zero no modo comparação) ────
  const allVals = [
    ...data.flatMap((d) => series.map((s) => d[s]).filter((v) => v != null && !isNaN(v))),
    ...forecastValsBySeries.flat(),
    ...(resolvedBenchmark?.value != null ? [resolvedBenchmark.value] : []),
  ];
  const { lo: yLoRaw, hi: yHiRaw } = yBounds(allVals);
  const ticks = niceTicks(yLoRaw, yHiRaw, yCaption ? 3 : 4);
  const tickFmt = yCaption ? fmtNumberShort : yFmt;
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];

  const sx = (i) => padL + (i / (totalPts - 1 || 1)) * innerW;
  const sy = (v) => padT + (1 - (v - yLo) / (yHi - yLo || 1)) * innerH;
  const ptsBySeries = series.map((s) =>
    data.map((d, i) => {
      const v = d[s];
      return v == null || isNaN(v) ? null : { x: sx(i), y: sy(v), v };
    })
  );
  const fcPtsBySeries = forecastValsBySeries.map((fc) =>
    fc.map((v, i) => ({ x: sx(data.length + i), y: sy(v), v, isForecast: true }))
  );

  // ── Focused-series last point (for endpoint dot + label) ─────────────────
  const focusedPts = focusMode && focusIdx >= 0 ? ptsBySeries[focusIdx] : null;
  // Último ponto NÃO NULO — se o ano mais recente ficou sem dado, o rótulo
  // de foco tem que ancorar no último valor real, não sumir ou apontar pro zero.
  const focusedLast = focusedPts ? [...focusedPts].reverse().find(Boolean) || null : null;

  // Séries de par para mediana/faixa: exclui o foco E os fixados — o que o
  // usuário fixou é escolha dele, não amostra estatística dos pares.
  const seriesDePar = series.filter((s) => s !== focusSeries && !pinned.has(s));

  // ── Peer median per x-tick ────────────────────────────────────────────────
  const medianAt = (i) => {
    const peerVals = seriesDePar
      .map((s) => data[i][s])
      .filter((v) => v != null && !isNaN(v))
      .sort((a, b) => a - b);
    if (peerVals.length === 0) return null;
    const mid = Math.floor(peerVals.length / 2);
    return peerVals.length % 2 === 0
      ? (peerVals[mid - 1] + peerVals[mid]) / 2
      : peerVals[mid];
  };
  // null quando nenhum par tem dado nesse ano — mesma regra de buraco das
  // séries: a mediana não pode "cair" pra zero por falta de amostra (achado
  // na varredura do arquivo, fora da lista do brief, mas mesmo padrão).
  const medianPts = (focusMode && showMedian)
    ? data.map((_, i) => {
        const mv = medianAt(i);
        return mv != null ? { x: sx(i), y: sy(mv), v: mv } : null;
      })
    : [];

  // ── Peer min/max band path ────────────────────────────────────────────────
  let bandPath = null;
  if (focusMode && showBand) {
    const peerSeries = seriesDePar;
    const peerMin = data.map((row) => {
      const vals = peerSeries.map((s) => row[s]).filter((v) => v != null && !isNaN(v) && isFinite(v));
      return vals.length ? Math.min(...vals) : null;
    });
    const peerMax = data.map((row) => {
      const vals = peerSeries.map((s) => row[s]).filter((v) => v != null && !isNaN(v) && isFinite(v));
      return vals.length ? Math.max(...vals) : null;
    });
    const validIndices = peerMin.map((v, i) => (v != null && peerMax[i] != null ? i : null)).filter((i) => i != null);
    if (validIndices.length >= 2) {
      const upper = validIndices.map((i) => `${sx(i)} ${sy(peerMax[i])}`).join(" L ");
      const lower = [...validIndices].reverse().map((i) => `${sx(i)} ${sy(peerMin[i])}`).join(" L ");
      bandPath = `M ${upper} L ${lower} Z`;
    }
  }

  const handleMove = (e) => {
    const px = viewBoxXFromOverlay(e.clientX, e.currentTarget.getBoundingClientRect(), padL, innerW);
    const xsAll = Array.from({ length: totalPts }, (_, i) => sx(i));
    setLocalHover(nearestIndexByX(xsAll, px));
  };

  const isHoverForecast = hover != null && hover >= data.length;

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => { setLocalHover(null); setHoverSeries(null); }}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          {(colors || []).map((c, i) => (
            <filter key={i} id={`mglow-${id}-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
          {focusMode && (
            <filter id={`mglow-${id}-focus`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          )}
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
        {/* X-axis labels */}
        {allLabels.map((lbl, i) => {
          const isReal = i < data.length;
          if (isReal && !shouldShowXLabel(i, data.length, w)) return null;
          return (
            <text key={i} x={sx(i)} y={height - padB + 18}
              className="nid-axis-text" textAnchor="middle"
              style={!isReal ? { fill: forecastColor } : undefined}>
              {lbl}
            </text>
          );
        })}

        {/* ── Range annotations (behind everything) ── */}
        {allAnnotations.filter((a) => a.xRange).map((a, i) => {
          const i0 = data.findIndex((d) => d.label === a.xRange[0]);
          const i1 = data.findIndex((d) => d.label === a.xRange[1]);
          if (i0 < 0 || i1 < 0) return null;
          const fill   = a.kind === "negative" ? "rgba(255,61,146,.06)" : "rgba(0,229,255,.06)";
          const stroke = a.kind === "negative" ? "rgba(255,61,146,.15)" : "rgba(0,229,255,.15)";
          // Posição direto na escala (não em ptsBySeries[0]): a primeira série
          // pode estar com buraco (null) justo nesse índice.
          return (
            <rect key={`band-${i}`}
              x={sx(i0)} y={padT}
              width={sx(i1) - sx(i0)}
              height={innerH}
              fill={fill} stroke={stroke} />
          );
        })}

        {/* ── Peer min/max band (behind all lines) ── */}
        {focusMode && showBand && bandPath && (
          <path d={bandPath} fill="var(--serie-contexto-faixa)" stroke="none" />
        )}

        {/* ── Real series paths ── peer lines first, focused line last (on top) ── */}
        {focusMode ? (
          <>
            {/* Peer lines — por trecho: null é ano sem dado, a linha abre um
                buraco em vez de descer até o eixo */}
            {ptsBySeries.map((pts, si) => {
              if (si === focusIdx || pinned.has(series[si])) return null; // depois
              const isHov = hoverSeries === si;
              return (
                <g key={si}
                  onMouseEnter={() => setHoverSeries(si)}
                  onMouseLeave={() => setHoverSeries(null)}>
                  {trechos(pts).map((seg, k) => (
                    seg.length === 1
                      ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="2"
                          fill={isHov ? "var(--accent-1)" : colorFor(si)} opacity={isHov ? 1 : 0.55} />
                      : <path key={k}
                          d={smoothPath(seg)}
                          stroke={isHov ? "var(--accent-1)" : colorFor(si)}
                          strokeWidth={strokeFor(si, isHov)}
                          fill="none" strokeLinecap="round"
                          opacity={isHov ? 1 : 0.55}
                          style={{ transition: "stroke 0.15s, opacity 0.15s" }} />
                  ))}
                  {/* Invisible wider hit target for hover — só onde há linha de verdade */}
                  {trechos(pts).map((seg, k) => (
                    seg.length > 1 &&
                    <path key={`hit-${k}`} d={smoothPath(seg)} stroke="transparent" strokeWidth="12" fill="none" />
                  ))}
                </g>
              );
            })}

            {/* Linhas fixadas pelo usuário — cor própria, espessura de linha
                real (não são "contexto" esmaecido como os demais pares) */}
            {ptsBySeries.map((pts, si) => {
              if (!pinned.has(series[si]) || si === focusIdx) return null;
              return (
                <g key={`pin-${si}`}>
                  {trechos(pts).map((seg, k) => (
                    seg.length === 1
                      ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="3" fill={colorFor(si)} />
                      : <path key={k} d={smoothPath(seg)} stroke={colorFor(si)}
                          strokeWidth={2} fill="none" strokeLinecap="round" />
                  ))}
                </g>
              );
            })}

            {/* Peer median dashed line — por trecho, mesmo tratamento de
                buraco: anos sem nenhum par com dado não viram um mergulho a 0 */}
            {showMedian && medianPts.some(Boolean) && (
              <>
                {trechos(medianPts).map((seg, k) => (
                  seg.length === 1
                    ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="2" fill="var(--text-dim)" />
                    : <path key={k} d={smoothPath(seg)}
                        stroke="var(--text-dim)" strokeWidth="1.4"
                        strokeDasharray="5 4" fill="none" />
                ))}
                {(() => {
                  const lastMedian = [...medianPts].reverse().find(Boolean);
                  return lastMedian && (
                    <text
                      x={lastMedian.x + 6} y={lastMedian.y + 4}
                      className="nid-axis-text"
                      style={{ fill: "var(--text-dim)" }}>
                      mediana
                    </text>
                  );
                })()}
              </>
            )}

            {/* Focused line — drawn last so it sits on top; por trecho, mesmo
                tratamento de buraco que as demais séries */}
            {focusIdx >= 0 && (
              <g>
                {trechos(ptsBySeries[focusIdx]).map((seg, k) => (
                  seg.length === 1
                    ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="3.5" fill={resolvedFocusColor} />
                    : <path key={k}
                        d={smoothPath(seg)}
                        stroke={resolvedFocusColor}
                        strokeWidth={2.5}
                        fill="none" strokeLinecap="round" />
                ))}
              </g>
            )}

            {/* Endpoint dot + label for focused series */}
            {focusedLast && (
              <>
                <circle cx={focusedLast.x} cy={focusedLast.y} r="5" fill={resolvedFocusColor} />
                <text
                  x={focusedLast.x + 8} y={focusedLast.y + 4}
                  className="nid-axis-text"
                  style={{ fill: resolvedFocusColor, fontSize: 11, fontWeight: 700 }}>
                  {focusSeries}
                </text>
              </>
            )}
          </>
        ) : (
          /* Legacy per-series-color rendering — por trecho, mesmo tratamento
             de buraco (null é ano sem dado, não zero) */
          ptsBySeries.map((pts, si) => (
            <g key={si}>
              {trechos(pts).map((seg, k) => (
                seg.length === 1
                  ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="3" fill={(colors || [])[si] || "var(--accent-1)"} />
                  : <path key={k} d={smoothPath(seg)} stroke={(colors || [])[si] || "var(--accent-1)"}
                      strokeWidth="2" fill="none" strokeLinecap="round" />
              ))}
            </g>
          ))
        )}

        {/* ── Forecast paths (one per series) ── */}
        {hasForecast && ptsBySeries.map((pts, si) => {
          const fc = fcPtsBySeries[si];
          if (!fc.length) return null;
          // Ancora no último ponto NÃO NULO: se o ano mais recente ficou sem
          // dado, a projeção continua do último valor real, não estoura em
          // pts[pts.length-1] == null.
          const lastReal = [...pts].reverse().find(Boolean);
          if (!lastReal) return null;
          return (
            <path key={`fc-${si}`}
              d={`M ${lastReal.x} ${lastReal.y} L ${fc.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
              stroke={forecastColor} strokeWidth="2" strokeDasharray="3 4" fill="none" opacity="0.8"
            />
          );
        })}

        {/* ── Benchmark line ── */}
        {resolvedBenchmark && (
          <g>
            <line
              x1={padL} x2={w - padR}
              y1={sy(resolvedBenchmark.value)} y2={sy(resolvedBenchmark.value)}
              stroke={resolvedBenchmark.color || "var(--text-dim)"}
              strokeDasharray="6 5" strokeWidth="1.2" opacity="0.55"
            />
            <text
              x={w - padR} y={sy(resolvedBenchmark.value) - 5}
              textAnchor="end" className="nid-axis-text"
              style={{ fill: resolvedBenchmark.color || "var(--text-dim)", letterSpacing: ".06em" }}
            >
              {resolvedBenchmark.label} · {tipFmt(resolvedBenchmark.value)}
            </text>
          </g>
        )}

        {hover != null && (
          <>
            <line x1={sx(hover)} x2={sx(hover)} y1={padT} y2={padT + innerH}
              stroke={isHoverForecast ? forecastColor : "var(--text-dim)"}
              strokeOpacity={isExternalHover ? 0.15 : 0.3}
              strokeDasharray={isExternalHover ? "3 5" : "2 3"} />
            {/* Real series hover dots */}
            {!isHoverForecast && ptsBySeries.map((pts, si) => {
              const p = pts[hover];
              if (!p) return null; // sem dado neste ano — nada pra apontar
              const dotColor = focusMode ? colorFor(si) : ((colors || [])[si] || "var(--accent-1)");
              const glowFilter = focusMode && si === focusIdx
                ? `url(#mglow-${id}-focus)`
                : `url(#mglow-${id}-${si})`;
              return (
                <g key={si}>
                  {glowHover && !focusMode && (
                    <circle cx={p.x} cy={p.y} r="8" fill={dotColor} opacity="0.4" filter={glowFilter} />
                  )}
                  {glowHover && focusMode && si === focusIdx && (
                    <circle cx={p.x} cy={p.y} r="8" fill={resolvedFocusColor} opacity="0.4" filter={glowFilter} />
                  )}
                  <circle cx={p.x} cy={p.y} r="4" fill="var(--bg)" stroke={dotColor} strokeWidth="2" />
                </g>
              );
            })}
            {/* Forecast hover dots */}
            {isHoverForecast && fcPtsBySeries.map((fc, si) => {
              const fcIdx = hover - data.length;
              const p = fc[fcIdx];
              if (!p) return null;
              return (
                <circle key={`fch-${si}`} cx={p.x} cy={p.y} r="4"
                  fill="var(--bg)" stroke={forecastColor} strokeWidth="2" strokeDasharray="2 2" />
              );
            })}
          </>
        )}

        {/* ── Point annotations ── */}
        {allAnnotations.filter((a) => a.x != null).map((a, i) => {
          const idx = data.findIndex((d) => d.label === a.x);
          if (idx < 0) return null;
          // Posição pela primeira série, mas ela pode estar com buraco (null)
          // nesse índice — cai pro centro vertical do plot na escala direta.
          const p = ptsBySeries[0][idx] || { x: sx(idx), y: padT + innerH / 2 };
          const fill = a.kind === "negative" ? "var(--accent-2)"
                     : a.kind === "positive" ? "var(--accent-5)"
                     : "var(--accent-1)";
          return (
            <g key={`ann-${i}`}>
              <circle cx={p.x} cy={p.y} r="5" fill="var(--bg)" stroke={fill} strokeWidth="2" />
              {a.label && (
                <foreignObject x={p.x - 60} y={p.y - 38} width="120" height="22">
                  <div xmlns="http://www.w3.org/1999/xhtml" className={`nid-pin${a.kind ? ` ${a.kind}` : ""}`}>
                    {a.label}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" onMouseMove={handleMove} />
      </svg>
      {hover != null && (
        <div className="nid-tip" style={{ left: `${(sx(hover) / w) * 100}%`, top: "10%", opacity: isExternalHover ? 0.75 : 1 }}>
          <div className="tip-label">{allLabels[hover]}</div>
          {isHoverForecast ? (
            <>
              {series.map((s, si) => {
                const fcIdx = hover - data.length;
                const p = fcPtsBySeries[si][fcIdx];
                if (!p) return null;
                return (
                  <div className="tip-row" key={s}>
                    <span className="name"><span className="swatch" style={{ background: forecastColor }}></span>{s} {forecastLabel.toUpperCase()}</span>
                    <span>{tipFmt(p.v)}</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: "var(--text-mute)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                regressão linear, {forecastN} pts
              </div>
            </>
          ) : focusMode ? (
            /* Focus-mode tooltip: foco (bold) → fixados (cor própria, nunca
               truncados — o usuário escolheu ver esses) → pares (esmaecidos,
               ordenados por proximidade ao foco, cortados em 8) → mediana */
            (() => {
              const focusValue = focusIdx >= 0 ? (data[hover][focusSeries] ?? null) : null;
              // Fixados usam a MESMA cor da linha/legenda (colorFor) — sem
              // isso o tooltip ficaria incoerente com o resto do gráfico
              // (achado do code review: fixado aparecia esmaecido igual a
              // um par comum e podia sumir no "e mais N").
              const fixados = (pinnedSeries || [])
                .filter((s) => s !== focusSeries && series.includes(s))
                .map((s) => ({ name: s, value: data[hover][s], color: colorFor(series.indexOf(s)) }));
              // seriesDePar já exclui foco E fixados (mesma lista usada pra
              // mediana/faixa) — reusar em vez de refiltrar evita que os
              // dois voltem a divergir.
              const peers = seriesDePar
                .map((s) => ({ name: s, value: data[hover][s] }))
                // Com até 9 linhas possíveis, as úteis são as que cercam o
                // foco — não as maiores em valor absoluto.
                .sort((a, b) =>
                  Math.abs((a.value ?? 0) - (focusValue ?? 0)) -
                  Math.abs((b.value ?? 0) - (focusValue ?? 0))
                );
              const medianValue = medianAt(hover);
              return (
                <>
                  {focusIdx >= 0 && focusValue != null && (
                    <div className="tip-row" style={{ fontWeight: 700 }}>
                      <span className="name">
                        <span className="swatch" style={{ background: resolvedFocusColor }} />
                        {focusSeries}
                      </span>
                      <span>{focusValue == null ? "—" : tipFmt(focusValue)}</span>
                    </div>
                  )}
                  {fixados.map((p) => (
                    <div className="tip-row" key={p.name}>
                      <span className="name">
                        <span className="swatch" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span>{p.value == null ? "—" : tipFmt(p.value)}</span>
                    </div>
                  ))}
                  {peers.slice(0, 8).map((p) => (
                    <div className="tip-row" key={p.name} style={{ opacity: 0.7 }}>
                      <span className="name">{p.name}</span>
                      <span>{p.value == null ? "—" : tipFmt(p.value)}</span>
                    </div>
                  ))}
                  {peers.length > 8 && (
                    <div className="tip-row" style={{ opacity: 0.5, fontSize: 11 }}>
                      <span className="name">… e mais {peers.length - 8}</span>
                      <span />
                    </div>
                  )}
                  {showMedian && medianValue != null && (
                    <div className="tip-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 2 }}>
                      <span className="name">mediana</span>
                      <span>{tipFmt(medianValue)}</span>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            series.map((s, si) => (
              <div className="tip-row" key={s}>
                <span className="name"><span className="swatch" style={{ background: (colors || [])[si] || "var(--accent-1)" }}></span>{s}</span>
                <span>{data[hover][s] == null ? "—" : tipFmt(data[hover][s])}</span>
              </div>
            ))
          )}
        </div>
      )}
      {legend && (focusMode ? (
        <InlineLegend items={[
          { name: focusSeries, color: resolvedFocusColor },
          ...(showMedian ? [{
            name: `mediana (${peerCount ?? seriesDePar.length} pares)`,
            color: "var(--text-dim)", kind: "dash",
          }] : []),
          ...(showBand ? [{ name: "faixa dos pares", color: "var(--serie-contexto)", kind: "band" }] : []),
          ...(pinnedSeries || []).map((s) => ({ name: s, color: colorFor(series.indexOf(s)) })),
        ]} />
      ) : (
        <InlineLegend
          items={series.map((s, si) => ({ name: s, color: (colors || [])[si] || "var(--accent-1)" }))}
          max={legendMax}
        />
      ))}
    </div>
  );
}

// ────────── TwinBarChart (CAGED) ──────────
// Internal bruto (side-by-side) renderer — preserves pre-ticket-05 behavior exactly.
function TwinBarBrutoChart({
  data, height, glow,
  colorUp, colorDown,
  yCaption,
  syncGroup,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [localHover, setLocalHover] = useState(null);
  const [externalLabel, setExternalLabel] = useChartHover(syncGroup);

  const externalIdx =
    externalLabel != null && data
      ? data.findIndex((d) => String(d.label) === String(externalLabel))
      : -1;

  const hover = localHover ?? (externalIdx >= 0 ? externalIdx : null);
  const isExternalHover = localHover == null && externalIdx >= 0;

  useEffect(() => {
    if (!syncGroup || !data) return;
    setExternalLabel(localHover != null ? data[localHover]?.label ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHover, syncGroup]);

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
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setLocalHover(null)}>
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
            <g key={i} onMouseEnter={() => setLocalHover(i)}>
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
              {shouldShowXLabel(i, data.length, w) && (
                <text x={cx} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="nid-tip" style={{
          left: `${(sxCenter(hover) / w) * 100}%`,
          top: isExternalHover
            ? `${((padT + 8) / height) * 100}%`
            : `${(Math.min(sy(data[hover].admissoes), sy(data[hover].desligamentos)) / height) * 100}%`,
          opacity: isExternalHover ? 0.75 : 1,
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

// Internal saldo renderer — single bar per period anchored to 0 baseline.
function TwinBarSaldoChart({
  data, height, glow,
  colorUp, colorDown,
  yCaption, showCumulative,
  syncGroup,
}) {
  const id = useId().replace(/:/g, "");
  const [wrapRef, w] = useContainerWidth(800);
  const [localHover, setLocalHover] = useState(null);
  const [externalLabel, setExternalLabel] = useChartHover(syncGroup);

  const externalIdx =
    externalLabel != null && data
      ? data.findIndex((d) => String(d.label) === String(externalLabel))
      : -1;

  const hover = localHover ?? (externalIdx >= 0 ? externalIdx : null);
  const isExternalHover = localHover == null && externalIdx >= 0;

  useEffect(() => {
    if (!syncGroup || !data) return;
    setExternalLabel(localHover != null ? data[localHover]?.label ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHover, syncGroup]);

  const glowMode = resolveGlow(glow);
  const glowHover  = glowMode !== "off";

  const padL = 56, padR = 24, padT = 18, padB = 34;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const saldos = data.map((d) => d.admissoes - d.desligamentos);

  // Compute cumulative before finalising maxAbs so we can expand if needed.
  let acc = 0;
  const cumRaw = saldos.map((s) => { acc += s; return acc; });
  const cumAbs = Math.max(...cumRaw.map(Math.abs), 0);
  const perAbs = Math.max(...saldos.map(Math.abs), 0);
  const maxAbs = Math.max(perAbs, showCumulative ? cumAbs : 0) * 1.15 || 1;

  const yScaleMin = -maxAbs;
  const yScaleMax =  maxAbs;

  const slot = innerW / data.length;
  const barW = slot * 0.55;
  const sxCenter = (i) => padL + slot * (i + 0.5);
  const sy = (v) => padT + ((yScaleMax - v) / (yScaleMax - yScaleMin)) * innerH;
  const zeroY = sy(0);

  // Cumulative path points
  const cumPts = cumRaw.map((v, i) => ({ x: sxCenter(i), y: sy(v), value: v }));
  const cumPath = cumPts.length > 1
    ? `M ${cumPts[0].x} ${cumPts[0].y} ` + cumPts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")
    : "";
  const lastCumPt = cumPts[cumPts.length - 1] || { x: 0, y: 0, value: 0 };

  // Y axis: 3 ticks — +max, 0, −max
  const tickMax  = Math.round(maxAbs / 1.15); // rough "nice" scale before padding
  const axisTicks = [tickMax, 0, -tickMax];

  return (
    <div className="nid-chart-wrap" ref={wrapRef} onMouseLeave={() => setLocalHover(null)}>
      <svg viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <filter id={`sglow-${id}`}>
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Grid lines at ±max and 0 */}
        {axisTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)}
              stroke={t === 0 ? "var(--text-mute)" : "var(--grid)"}
              strokeDasharray={t === 0 ? "none" : "3 4"}
              strokeWidth={t === 0 ? "1" : "1"}
              opacity={t === 0 ? "0.6" : "1"}
            />
            <text x={padL - 10} y={sy(t) + 3.5} className="nid-axis-text" textAnchor="end">
              {t === 0 ? "0" : (t > 0 ? "+" : "") + fmtNumberShort(t)}
            </text>
          </g>
        ))}

        {/* Explicit zero line for emphasis */}
        <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY}
          stroke="var(--text-mute)" strokeWidth="1" opacity="0.6" />

        {yCaption && (
          <text className="axis-cap"
            x={14} y={height / 2}
            transform={`rotate(-90 14 ${height / 2})`}
            textAnchor="middle">
            {yCaption}
          </text>
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const saldo = saldos[i];
          const fill = saldo >= 0 ? colorUp : colorDown;
          const barY  = saldo >= 0 ? sy(saldo) : zeroY;
          const barH  = Math.abs(zeroY - sy(saldo));
          const cx = sxCenter(i);
          const isH = hover === i;
          return (
            <g key={i} onMouseEnter={() => setLocalHover(i)}>
              {glowHover && isH && (
                <rect x={cx - barW / 2 - 2} y={barY - 2} width={barW + 4} height={barH + 4}
                  rx={4} fill={fill} opacity="0.55" filter={`url(#sglow-${id})`} />
              )}
              <rect
                x={cx - barW / 2} y={barY}
                width={barW} height={Math.max(barH, 1)}
                rx={2}
                fill={fill}
                opacity={hover != null && !isH ? 0.35 : 0.9}
              />
              {shouldShowXLabel(i, data.length, w) && (
                <text x={cx} y={height - padB + 18} className="nid-axis-text" textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Cumulative YTD acumulado line */}
        {showCumulative && cumPts.length > 1 && (
          <>
            <path d={cumPath} stroke="var(--accent-1)" strokeWidth="2" fill="none"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <circle cx={lastCumPt.x} cy={lastCumPt.y} r="4" fill="var(--accent-1)" />
            <text x={lastCumPt.x + 8} y={lastCumPt.y + 4}
              className="nid-axis-text" style={{ fill: "var(--accent-1)" }}>
              acumulado YTD
            </text>
          </>
        )}
      </svg>

      {hover != null && (() => {
        const d = data[hover];
        const saldo = saldos[hover];
        const saldoColor = saldo >= 0 ? colorUp : colorDown;
        const tipX = sxCenter(hover);
        const barTop = saldo >= 0 ? sy(saldo) : zeroY;
        return (
          <div className="nid-tip" style={{
            left: `${(tipX / w) * 100}%`,
            top: isExternalHover
              ? `${((padT + 8) / height) * 100}%`
              : `${(barTop / height) * 100}%`,
            opacity: isExternalHover ? 0.75 : 1,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}>
            <div className="tip-label">{d.label}</div>
            <div className="tip-row" style={{ marginBottom: 2 }}>
              <span className="name" style={{ fontWeight: 700, color: saldoColor }}>SALDO</span>
              <span style={{ fontWeight: 700, color: saldoColor }}>
                {saldo >= 0 ? "+" : ""}{fmtNumber(saldo)} {saldo >= 0 ? "▲" : "▼"}
              </span>
            </div>
            <div className="tip-row" style={{ opacity: 0.7 }}>
              <span className="name"><span className="swatch" style={{ background: colorUp }}></span>admissões</span>
              <span>{fmtNumber(d.admissoes)}</span>
            </div>
            <div className="tip-row" style={{ opacity: 0.7 }}>
              <span className="name"><span className="swatch" style={{ background: colorDown }}></span>desligamentos</span>
              <span>{fmtNumber(d.desligamentos)}</span>
            </div>
            {showCumulative && (
              <div className="tip-row" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4, opacity: 0.85 }}>
                <span className="name"><span className="swatch" style={{ background: "var(--accent-1)" }}></span>acumulado YTD</span>
                <span style={{ color: "var(--accent-1)" }}>
                  {cumRaw[hover] >= 0 ? "+" : ""}{fmtNumber(cumRaw[hover])}
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Public component — dispatches to saldo or bruto renderer based on `mode`.
export function TwinBarChart({
  data, height = 280, glow = "hover",
  colorUp = "var(--accent-5)", colorDown = "var(--accent-2)",
  yCaption,
  mode = "saldo",
  showCumulative,
  loading,
  emptyMessage,
  emptyAction,
  syncGroup,    // ticket 14: cross-chart hover sync
}) {
  if (loading) return <ChartState kind="loading" shape="twin" height={height} />;
  if (!data || data.length === 0) return <EmptyChart h={height} shape="twin" message={emptyMessage} action={emptyAction} />;

  // Default showCumulative to true in saldo mode, false otherwise.
  const cumulative = showCumulative != null ? showCumulative : mode === "saldo";

  // Cada renderer mede o próprio container: medir aqui e passar ref+largura
  // deixava o ResizeObserver preso à div do renderer desmontado na troca de
  // modo (o navegador entrega 0x0 ao removê-la) e nunca o religava à nova.
  const shared = { data, height, glow, colorUp, colorDown, yCaption, syncGroup };

  if (mode === "bruto") {
    return <TwinBarBrutoChart {...shared} />;
  }

  return <TwinBarSaldoChart {...shared} showCumulative={cumulative} />;
}

// ────────── DonutChartCore (inner implementation) ──────────
function DonutChartCore({
  data, colors, height = 220, glow = "hover", centerLabel, centerSub, legend = false,
  onSelect,
}) {
  const id = useId().replace(/:/g, "");
  const [hoverSlice, setHoverSlice] = useState(null);
  if (!data || data.length === 0) return <EmptyChart h={height} shape="donut" />;
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
    <div
      className="nid-chart-wrap"
      style={
        legend
          ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }
          : { display: "grid", placeItems: "center" }
      }
    >
      <svg viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, width: size }}
        onMouseLeave={() => setHoverSlice(null)}>
        <defs>
          <filter id={`dglow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {slices.map((s, i) => (
          <g key={i} onMouseEnter={() => setHoverSlice(i)}
            onClick={onSelect ? () => onSelect(s) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
            role={onSelect ? "button" : undefined}
          >
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

      {legend && (
        <ul
          style={{ listStyle: "none", margin: 0, padding: 0, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}
          onMouseLeave={() => setHoverSlice(null)}
        >
          {slices.map((s, i) => (
            <li
              key={i}
              onMouseEnter={() => setHoverSlice(i)}
              onClick={onSelect ? () => onSelect(s) : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                opacity: hoverSlice != null && hoverSlice !== i ? 0.5 : 1,
                transition: "opacity 120ms ease",
                cursor: onSelect ? "pointer" : undefined,
              }}
              role={onSelect ? "button" : undefined}
            >
              <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label ?? s.name}
              </span>
              <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                {fmtNumber(s.value)}
              </span>
              <span style={{ color: "var(--text-mute)", fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "right" }}>
                {(s.pct * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ────────── PercentBarChart (100% stacked horizontal bar) ──────────
function PercentBarChart({ data, baseColor, colors, centerLabel, centerSub, onSelect }) {
  const [hoverSeg, setHoverSeg] = useState(null);
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  // When a distinct `colors` palette is supplied, each segment keeps its own
  // color (mapped by original index so it matches an external legend built from
  // the same palette+order). Otherwise fall back to a monochrome opacity ramp.
  const useColors = Array.isArray(colors) && colors.length > 0;
  const sorted = [...data.map((d, i) => ({ ...d, _i: i }))].sort((a, b) => b.value - a.value);
  const opacityScale = [0.95, 0.7, 0.5, 0.35, 0.25, 0.18];
  const segColor = (d) => (useColors ? colors[d._i % colors.length] : baseColor);
  const nameOf = (d) => d.label ?? d.name ?? "";

  return (
    <div className="nid-pct-wrap">
      {/* Total label — centerLabel/centerSub as header above bar */}
      {(centerLabel || centerSub) && (
        <div className="nid-pct-total">
          <span className="big">{centerLabel}</span>
          {centerSub && <span className="small">{centerSub}</span>}
        </div>
      )}

      {/* Single 100% horizontal bar */}
      <div
        className="nid-pct-bar"
        role="img"
        aria-label="composição percentual"
        onMouseLeave={() => setHoverSeg(null)}
      >
        {sorted.map((d, i) => {
          const pct = (d.value / total) * 100;
          const rampOpacity = opacityScale[i] ?? 0.12;
          const opacity = useColors ? 1 : rampOpacity;
          const isHovered = hoverSeg === i;
          const isDimmed = hoverSeg != null && !isHovered;
          return (
            <div
              key={nameOf(d) || i}
              className="nid-pct-seg"
              style={{
                flex: pct,
                background: segColor(d),
                opacity: isHovered ? 1 : isDimmed ? opacity * 0.5 : opacity,
                outline: isHovered ? "2px solid var(--border-strong)" : "none",
                outlineOffset: "-2px",
                cursor: onSelect ? "pointer" : undefined,
              }}
              title={`${nameOf(d)}: ${d.value.toLocaleString("pt-BR")} · ${pct.toFixed(1)}%`}
              onMouseEnter={() => setHoverSeg(i)}
              onClick={onSelect ? () => onSelect(d) : undefined}
              role={onSelect ? "button" : undefined}
            >
              {/* Inline label only when segment is wide enough and opaque enough to be readable */}
              {pct > 12 && (useColors || rampOpacity >= 0.4) && (
                <span className="nid-pct-seg-label">{pct.toFixed(0)}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend rows: swatch · label · absolute · percent */}
      <ul className="nid-pct-legend">
        {sorted.map((d, i) => {
          const pct = (d.value / total) * 100;
          const opacity = useColors ? 1 : (opacityScale[i] ?? 0.12);
          return (
            <li
              key={nameOf(d) || i}
              style={{
                opacity: hoverSeg != null && hoverSeg !== i ? 0.45 : 1,
                cursor: onSelect ? "pointer" : undefined,
              }}
              onMouseEnter={() => setHoverSeg(i)}
              onMouseLeave={() => setHoverSeg(null)}
              onClick={onSelect ? () => onSelect(d) : undefined}
              role={onSelect ? "button" : undefined}
            >
              <span className="sw" style={{ background: segColor(d), opacity }} />
              <span className="label">{nameOf(d)}</span>
              <span className="val">
                {d.value.toLocaleString("pt-BR")} · {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ────────── DonutChart (public — auto-falls back to PercentBarChart) ──────────
export function DonutChart({
  data, baseColor, prefer = "auto", threshold = 4,
  colors, height, glow, centerLabel, centerSub, legend = false,
  loading,
  emptyMessage,
  emptyAction,
  onSelect,
}) {
  if (loading) return <ChartState kind="loading" shape="donut" height={height || 220} />;
  if (!data || data.length === 0) return <EmptyChart h={height || 220} shape="donut" message={emptyMessage} action={emptyAction} />;

  const useBar =
    prefer === "bar" ||
    (prefer === "auto" && data && data.length > threshold);

  // When the caller passes only baseColor (monochrome), synthesize a colors
  // array using the same opacity ramp PercentBarChart uses, via color-mix()
  // so the donut still respects theme tokens.
  const opacityRamp = [0.95, 0.7, 0.5, 0.35, 0.25, 0.18];
  const resolvedColors =
    colors && colors.length > 0
      ? colors
      : data.map((_, i) => {
          const opacity = opacityRamp[i] ?? 0.12;
          return `color-mix(in oklab, ${baseColor || "var(--accent-1)"} ${Math.round(opacity * 100)}%, transparent)`;
        });

  return useBar
    ? (
      <PercentBarChart
        data={data}
        baseColor={baseColor || "var(--accent-1)"}
        colors={colors}
        centerLabel={centerLabel}
        centerSub={centerSub}
        onSelect={onSelect}
      />
    )
    : (
      <DonutChartCore
        data={data}
        colors={resolvedColors}
        height={height}
        glow={glow}
        centerLabel={centerLabel}
        centerSub={centerSub}
        legend={legend}
        onSelect={onSelect}
      />
    );
}

// ────────── Horizontal Bar (Ranking) ──────────
export function HBarChart({
  data,
  highlight,
  showPosition = false,
  positionOffset = 0,
  color = "var(--accent-1)",
  highlightColor = "var(--accent-2)",
  // legacy props — kept for backward-compat (no-op in new layout)
  glow,
  height,
  fmt = fmtMoneyFull,
  loading,
  emptyMessage,
  emptyAction,
  onSelect,
}) {
  if (loading) return <ChartState kind="loading" shape="hbar" height={height || 240} />;
  if (!data || data.length === 0) return <EmptyChart h={height || 240} shape="hbar" message={emptyMessage} action={emptyAction} />;
  const max = Math.max(...data.map((d) => d.value)) || 1;

  return (
    <div className="nid-hbar" role="list">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const isOwn = Boolean(highlight && d.label === highlight);
        const barColor = isOwn ? highlightColor : color;
        return (
          <div
            className="nid-hbar-row"
            key={d.label ?? i}
            role={onSelect ? "button" : "listitem"}
            aria-label={`${i + 1 + positionOffset}. ${d.label}: ${fmt(d.value)}`}
            onClick={onSelect ? () => onSelect(d) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            {showPosition && (
              <span className={`pos${isOwn ? " own" : ""}`}>
                #{i + 1 + positionOffset}
              </span>
            )}
            <div className="bar-wrap">
              <div
                className={`bar${isOwn ? " own" : ""}`}
                style={{ width: `${pct}%`, "--bar": barColor }}
              />
              <span className={`city${isOwn ? " own" : ""}`} title={d.label}>{d.label}</span>
            </div>
            <span className={`val${isOwn ? " own" : ""}`}>{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyChart({ h = 240, shape = "line", message, action }) {
  return (
    <ChartState kind="empty" shape={shape} height={h} message={message} action={action} />
  );
}
