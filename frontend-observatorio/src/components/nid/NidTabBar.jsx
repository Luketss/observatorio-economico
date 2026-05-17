export default function NidTabBar({
  tabs,          // array of strings or { label, count?, key? } objects
  value,         // current selected tab — index OR key (auto-detected from tabs)
  onChange,      // (newValueOrKey) => void
  ariaLabel,
  className = "",
}) {
  const normalized = tabs.map((t, i) => {
    if (typeof t === "string") return { key: i, label: t };
    return { key: t.key ?? i, label: t.label, count: t.count };
  });
  const activeKey = value;

  return (
    <div role="tablist" aria-label={ariaLabel} className={`nid-tabbar ${className}`}>
      {normalized.map((t) => {
        const active = activeKey === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            onClick={() => onChange(t.key)}
            className={`nid-tabbar__tab ${active ? "is-active" : ""}`}
          >
            <span>{t.label}</span>
            {t.count != null && <span className="nid-tabbar__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
