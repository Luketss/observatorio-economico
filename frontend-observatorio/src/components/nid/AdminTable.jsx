import StatusPill from "./StatusPill";

// ─────────────────────────────────────────────────────────────────────────────
// AdminTable — column-config-driven admin table
// Ticket 17 — shared component for Municípios, Usuários, Notificações, Releases
//
// Column descriptor shape:
//   { key, label?, kind?, width?, align?, mono?, render?, pillKind?, pillLabel?, actions? }
//
// kind values:
//   "checkbox"     — row selection checkbox; reads selectedIds, fires onSelectionChange
//   "avatar+text"  — circle/brasão + primary text (+ optional secondary).
//                    Use column.render(row) → { avatar, primary, secondary? }
//   "pill"         — <StatusPill kind={col.pillKind(row)} label={col.pillLabel(row)} dot />
//   "relative-time"— humanizes ISO / ms timestamp to "há 6 min", "há 2 d", etc.
//   "row-actions"  — <div class="rowact"> with icon buttons from column.actions[]
//   (omit)         — renders row[key] or column.render(row) if provided
//
// mono: true on any column applies tabular-mono font.
//
// Props:
//   columns          — array of column descriptors (see above)
//   data             — array of row objects
//   rowKey           — (row) => string|number  — unique key extractor
//   selectedIds      — Set<string|number> | array  — controlled selection
//   onSelectionChange— (newSet) => void
//   emptyState       — optional ReactNode shown when data is empty
//
// Usage example:
//
//   <AdminTable
//     columns={[
//       { key: "_select", kind: "checkbox", width: 32 },
//       { key: "nome", label: "Município", kind: "avatar+text",
//         render: (row) => ({ avatar: <Brasao src={row.brasao} />, primary: row.nome }) },
//       { key: "estado", label: "UF", align: "left", mono: true },
//       { key: "plano", label: "Plano", kind: "pill",
//         pillKind: (row) => row.plano,
//         pillLabel: (row) => row.planoLabel || row.plano },
//       { key: "datasets_cobertos", label: "Datasets", mono: true,
//         render: (row) => `${row.cobertos} / ${row.total}` },
//       { key: "ultima_sync", label: "Última sync", mono: true, kind: "relative-time" },
//       { key: "status", label: "Status", kind: "pill",
//         pillKind: (row) => row.status, pillLabel: (row) => row.statusLabel },
//       { key: "_actions", kind: "row-actions",
//         actions: [
//           { icon: "edit", onClick: (row) => {}, label: "Editar" },
//           { icon: "menu", onClick: (row) => {}, label: "Mais" },
//         ] },
//     ]}
//     data={rows}
//     rowKey={(row) => row.id}
//     selectedIds={selectedIds}
//     onSelectionChange={setSelectedIds}
//   />
// ─────────────────────────────────────────────────────────────────────────────

// ─── Relative-time formatter ──────────────────────────────────────────────────
function relativeTime(value) {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);

  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const prefix = diffMs < 0 ? "em " : "há ";

  if (abs < 60_000) return `${prefix}${Math.round(abs / 1_000)} s`;
  if (abs < 3_600_000) return `${prefix}${Math.round(abs / 60_000)} min`;
  if (abs < 86_400_000) return `${prefix}${Math.round(abs / 3_600_000)} h`;
  if (abs < 2_592_000_000) return `${prefix}${Math.round(abs / 86_400_000)} d`;
  return `${prefix}${Math.round(abs / 2_592_000_000)} meses`;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────
const ICON_CHARS = {
  edit: "✎",
  menu: "⋯",
  delete: "✕",
  view: "◉",
  more: "⋯",
};

function iconChar(icon) {
  return ICON_CHARS[icon] ?? icon;
}

// ─── Normalise selectedIds to a Set ──────────────────────────────────────────
function toSet(selectedIds) {
  if (!selectedIds) return new Set();
  if (selectedIds instanceof Set) return selectedIds;
  return new Set(selectedIds);
}

// ─── AdminTable ───────────────────────────────────────────────────────────────
export default function AdminTable({
  columns = [],
  data = [],
  rowKey = (row, i) => row.id ?? i,
  selectedIds,
  onSelectionChange,
  emptyState,
}) {
  const selected = toSet(selectedIds);

  const hasCheckbox = columns[0]?.kind === "checkbox";

  // Derive all row keys for master-checkbox logic
  const allKeys = data.map((row, i) => rowKey(row, i));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = !allSelected && allKeys.some((k) => selected.has(k));

  function handleMasterChange() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  }

  function handleRowSelect(key) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  }

  return (
    <div className="nid-admin-table">
      <table>
        <thead>
          <tr>
            {columns.map((col, ci) => {
              if (col.kind === "checkbox") {
                return (
                  <th key={col.key ?? ci} style={{ width: col.width ?? 32 }}>
                    <span
                      className={`tbl-row-checkbox${allSelected ? " on" : someSelected ? " partial" : ""}`}
                      role="checkbox"
                      aria-checked={allSelected ? true : someSelected ? "mixed" : false}
                      tabIndex={0}
                      aria-label="Selecionar todos"
                      onClick={handleMasterChange}
                      onKeyDown={(e) => e.key === "Enter" || e.key === " " ? handleMasterChange() : undefined}
                    />
                  </th>
                );
              }
              if (col.kind === "row-actions") {
                return (
                  <th key={col.key ?? ci} style={{ width: col.width ?? 60 }} />
                );
              }
              return (
                <th
                  key={col.key ?? ci}
                  style={{
                    textAlign: col.align || "left",
                    width: col.width,
                  }}
                >
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="nid-admin-table__empty">
                {emptyState ?? (
                  <span className="nid-admin-table__empty-text">
                    Nenhum item encontrado.
                  </span>
                )}
              </td>
            </tr>
          ) : (
            data.map((row, ri) => {
              const key = rowKey(row, ri);
              const isSelected = selected.has(key);
              return (
                <tr
                  key={key}
                  className={isSelected ? "selected" : undefined}
                  data-selected={isSelected || undefined}
                >
                  {columns.map((col, ci) => (
                    <td
                      key={col.key ?? ci}
                      style={{ textAlign: col.align || "left" }}
                      className={col.mono ? "mono" : undefined}
                    >
                      <Cell
                        row={row}
                        col={col}
                        isSelected={isSelected}
                        onSelect={() => handleRowSelect(key)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────
function Cell({ row, col, isSelected, onSelect }) {
  // ── checkbox ──
  if (col.kind === "checkbox") {
    return (
      <span
        className={`tbl-row-checkbox${isSelected ? " on" : ""}`}
        role="checkbox"
        aria-checked={isSelected}
        tabIndex={0}
        aria-label="Selecionar linha"
        onClick={onSelect}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      />
    );
  }

  // ── avatar+text ──
  if (col.kind === "avatar+text") {
    const rendered = col.render ? col.render(row) : { primary: row[col.key] };
    return (
      <div className="nid-admin-table__avatar-cell">
        {rendered.avatar && (
          <div className="nid-admin-table__avatar">{rendered.avatar}</div>
        )}
        <div className="nid-admin-table__avatar-text">
          <span className="nid-admin-table__avatar-primary">
            {rendered.primary}
          </span>
          {rendered.secondary && (
            <span className="nid-admin-table__avatar-secondary">
              {rendered.secondary}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── pill ──
  if (col.kind === "pill") {
    const kind = col.pillKind ? col.pillKind(row) : row[col.key];
    const label = col.pillLabel ? col.pillLabel(row) : row[col.key];
    return <StatusPill kind={kind} label={label} dot />;
  }

  // ── relative-time ──
  if (col.kind === "relative-time") {
    const v = col.render ? col.render(row) : row[col.key];
    return <span className="mono">{relativeTime(v)}</span>;
  }

  // ── row-actions ──
  if (col.kind === "row-actions") {
    const actions = col.actions ?? [];
    return (
      <div className="rowact">
        {actions.map((action, ai) => (
          <button
            key={ai}
            type="button"
            aria-label={action.label}
            title={action.label}
            onClick={() => action.onClick?.(row)}
          >
            {iconChar(action.icon)}
          </button>
        ))}
      </div>
    );
  }

  // ── default / mono / plain ──
  const v = col.render ? col.render(row) : row[col.key];
  return v != null ? v : <span className="nid-admin-table__muted">—</span>;
}
