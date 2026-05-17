// ChartState — ticket 09
// Unified empty + loading states for all chart shapes.
//
// Props:
//   kind      "loading" | "empty"
//   shape     "line" | "bar" | "stacked" | "twin" | "hbar" | "donut" | "kpi"
//   height    number (px)
//   message   string  — primary heading in empty state
//   detail    string  — secondary copy in empty state
//   action    { label, onClick?, href? } — optional CTA button/link
//   eyebrow   string  — tiny label above heading in empty state

export default function ChartState({
  kind = "empty",
  shape = "line",
  height = 240,
  message,
  detail,
  action,
  eyebrow,
}) {
  const Frame = ({ children }) => (
    <div
      className={`nid-chart-state ${kind}`}
      style={{ height, position: "relative" }}
    >
      {children}
    </div>
  );

  if (kind === "loading") {
    return (
      <Frame>
        <Skeleton shape={shape} height={height} />
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="nid-empty-content">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h4>{message || "Sem dados disponíveis"}</h4>
        {detail && <p>{detail}</p>}
        {action && (
          action.href
            ? <a href={action.href} className="btn">{action.label}</a>
            : <button onClick={action.onClick} className="btn">{action.label}</button>
        )}
      </div>
    </Frame>
  );
}

// ────────── Skeleton shapes ──────────

function Skeleton({ shape, height }) {
  switch (shape) {
    case "line":
      return (
        <>
          <div className="skel" style={{ height, borderRadius: 8 }} />
          <svg
            viewBox="0 0 200 80"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: "20px 16px", opacity: 0.35 }}
          >
            <path
              d="M2 60 L40 50 L80 55 L120 35 L160 40 L196 20"
              stroke="var(--text-dim)"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        </>
      );

    case "bar":
    case "stacked":
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height, padding: 16 }}>
          {[0.6, 0.8, 0.5, 0.9, 0.7, 1.0].map((h, i) => (
            <div
              key={i}
              className="skel"
              style={{ flex: 1, height: `${h * 100}%`, borderRadius: 4 }}
            />
          ))}
        </div>
      );

    case "twin":
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, padding: 16 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="skel"
              style={{
                flex: 1,
                height: `${30 + Math.abs(Math.sin(i)) * 60}%`,
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      );

    case "hbar":
      return (
        <div style={{ padding: 16 }}>
          {[1.0, 0.78, 0.62, 0.48, 0.34].map((w, i) => (
            <div
              key={i}
              className="skel"
              style={{ width: `${w * 100}%`, height: 22, marginTop: 8, borderRadius: 5 }}
            />
          ))}
        </div>
      );

    case "donut":
      return (
        <div style={{ display: "grid", placeItems: "center", height }}>
          <div className="skel" style={{ width: 160, height: 160, borderRadius: "50%" }} />
        </div>
      );

    case "kpi":
      return (
        <div style={{ padding: 4 }}>
          <div className="skel" style={{ height: 10, width: "60%" }} />
          <div className="skel" style={{ height: 28, width: "50%", marginTop: 14 }} />
          <div className="skel" style={{ height: 10, width: "38%", marginTop: 10 }} />
          <div
            className="skel"
            style={{
              height: 42,
              width: "calc(100% + 36px)",
              margin: "14px -18px -16px",
              borderRadius: 0,
            }}
          />
        </div>
      );

    default:
      return <div className="skel" style={{ height, borderRadius: 8 }} />;
  }
}
