/**
 * BulkActions — sticky bulk-action toolbar
 *
 * Renders nothing when count === 0 (no empty bar in the DOM).
 *
 * Props:
 *   count    — number of selected rows
 *   onClear  — () => void   called when the user clicks ✕
 *   children — action buttons / controls to show between the count and the clear button
 */
export default function BulkActions({ count, onClear, children }) {
  if (count === 0) return null;
  return (
    <div className="nid-bulk-bar">
      <span className="nid-bulk-bar__count">
        <em>{count}</em> selecionado{count === 1 ? "" : "s"}
      </span>
      <span className="nid-bulk-bar__sep" />
      <div className="nid-bulk-bar__actions">{children}</div>
      <button onClick={onClear} className="nid-bulk-bar__clear" aria-label="Limpar seleção">
        ✕
      </button>
    </div>
  );
}
