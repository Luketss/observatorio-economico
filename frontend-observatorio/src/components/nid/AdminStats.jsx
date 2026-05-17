/**
 * AdminStats — dense KPI strip for admin list pages.
 *
 * Usage:
 *   <AdminStats items={[
 *     { label: "Municípios", value: 42 },
 *     { label: "Pro / Premium", value: 12, unit: " · 28%" },
 *     { label: "Última atualização", value: "há 2 h" },
 *     { label: "Free", value: 30, detail: <span style={{ color: "var(--text-mute)" }}>sem plano pago</span> },
 *   ]} />
 *
 * Item shape:
 *   label    — string (required)
 *   value    — string | number (required)
 *   unit     — string? — softer unit rendered after value (e.g. " jobs", " · 33%")
 *   detail   — ReactNode? — sub-line below value (can include status dots)
 *   onClick  — function? — makes the cell a keyboard-accessible button
 */
export default function AdminStats({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="nid-admin-stats">
      {items.map((it, i) => (
        <div
          key={i}
          className="nid-admin-stats__cell"
          onClick={it.onClick}
          role={it.onClick ? "button" : undefined}
          tabIndex={it.onClick ? 0 : undefined}
          onKeyDown={it.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); it.onClick(e); } } : undefined}
        >
          <div className="nid-admin-stats__label">{it.label}</div>
          <div className="nid-admin-stats__value">
            {it.value}
            {it.unit && <span className="nid-admin-stats__unit">{it.unit}</span>}
          </div>
          {it.detail && <div className="nid-admin-stats__detail">{it.detail}</div>}
        </div>
      ))}
    </div>
  );
}
