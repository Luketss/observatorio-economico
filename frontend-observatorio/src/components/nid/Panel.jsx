import { useState } from "react";
import ChartInfoIcon from "../ChartInfoIcon";
import { Sparkline } from "./charts";

export function NidPageHeader({ title, sub, badge, chips }) {
  return (
    <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700,
          letterSpacing: "-0.025em", margin: 0, color: "var(--text)",
        }}>
          {title}
        </h1>
        {sub && (
          <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 3 }}>{sub}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
        {badge && <span className="nid-pill">{badge}</span>}
        {chips && chips.length > 0 && chips.map((c, i) => (
          <span
            key={i}
            className={`nid-pill nid-pill--inner${c.active ? " nid-pill--active" : ""}`}
            style={{ cursor: c.onClick ? "pointer" : "default" }}
            onClick={c.onClick}
            role={c.onClick ? "button" : undefined}
            tabIndex={c.onClick ? 0 : undefined}
            aria-label={c.onClick ? (c.ariaLabel || (typeof c.label === "string" ? c.label : undefined)) : undefined}
            onKeyDown={c.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") c.onClick(e); } : undefined}
          >
            {c.label}
            {c.onClear && (
              <span
                className="nid-pill-x"
                role="button"
                aria-label={`Remover filtro ${c.label}`}
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); c.onClear(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); c.onClear(); } }}
              >
                ✕
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function NidPanel({ title, sub, tabs, onTabChange, children, right, dataset, indicadorKey }) {
  const [active, setActive] = useState(0);
  const comInfo = Boolean(dataset && indicadorKey);
  return (
    <div className="nid-panel">
      <div className="nid-panel-head">
        <div>
          <h3
            className="nid-panel-title"
            style={comInfo ? { display: "flex", alignItems: "center", gap: 6 } : undefined}
          >
            {title}
            {comInfo && <ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />}
          </h3>
          {sub && <div className="nid-panel-sub">{sub}</div>}
        </div>
        {tabs ? (
          <div className="nid-panel-actions">
            {tabs.map((t, i) => (
              <button
                key={i}
                className={`nid-tab ${i === active ? "active" : ""}`}
                onClick={() => { setActive(i); onTabChange?.(i); }}
              >
                {t}
              </button>
            ))}
          </div>
        ) : right}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function NidLegend({ items }) {
  return (
    <div className="nid-legend">
      {items.map((it, i) => (
        <span key={i}>
          <span className="swatch" style={{ background: it.color }}></span>
          {it.name}
        </span>
      ))}
    </div>
  );
}

export function NidInsight({ kind = "info", children }) {
  const glyph = kind === "up" ? "↗" : kind === "down" ? "↘" : "i";
  return (
    <div className={`nid-insight ${kind}`}>
      <div className="marker">{glyph}</div>
      <div className="body">{children}</div>
    </div>
  );
}

/**
 * Hero KPI card — themed neon chrome with sparkline at the bottom.
 * Use this on dashboards where you want the design's strong visual identity.
 */
export function NidKpiHero({
  label, badge, value, unit, delta, foot, color = "var(--accent-1)", sparkData, glow = true,
  dataset, indicadorKey,
  tabs, onTabChange, // abas de período do próprio KPI (ex.: ["2026", "Histórico"])
}) {
  const comInfo = Boolean(dataset && indicadorKey);
  const [activeTab, setActiveTab] = useState(0);
  return (
    <div
      className="nid-kpi"
      style={{ "--accent-1-glow": `color-mix(in oklab, ${color} 50%, transparent)` }}
    >
      <div className="nid-kpi-label">
        <span>{label}</span>
        {comInfo && <ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />}
        {badge && <span className="nid-badge">{badge}</span>}
        {tabs && tabs.length > 0 && (
          <span className="nid-kpi-tabs" role="tablist" aria-label="Período">
            {tabs.map((t, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activeTab}
                className={`nid-tab ${i === activeTab ? "active" : ""}`}
                onClick={() => { setActiveTab(i); onTabChange?.(i); }}
              >
                {t}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="nid-kpi-value">
        {value}
        {unit && <span className="nid-unit"> {unit}</span>}
      </div>
      {(delta || foot) && (
        <div className="nid-kpi-foot">
          {delta && (
            <span className={`nid-delta ${delta.up === true ? "up" : delta.up === false ? "down" : "flat"}`}>
              {delta.up === true ? "▲" : delta.up === false ? "▼" : "•"} {delta.v}
            </span>
          )}
          {foot && <span className="foot-text">{foot}</span>}
        </div>
      )}
      {sparkData && sparkData.length > 0 && (
        <div className="nid-kpi-spark">
          <Sparkline data={sparkData} color={color} glow={glow} height={42} width={260} />
        </div>
      )}
    </div>
  );
}
