/**
 * StatusPill — themed status badge
 *
 * @param {"ok"|"warn"|"err"|"draft"|"info"|"pro"|"premium"|"free"} kind
 * @param {boolean} dot   — show a small colored dot before the label
 * @param {string}  label — text content (takes priority over children)
 * @param {string}  className — extra classes to merge
 */
export default function StatusPill({ kind = "info", dot = false, label, children, className = "" }) {
  return (
    <span className={`nid-pill nid-pill--${kind}${className ? ` ${className}` : ""}`}>
      {dot && <span className="nid-pill-dot" />}
      {label ?? children}
    </span>
  );
}
