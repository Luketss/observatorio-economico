// tableSort — lógica pura de ordenação do DataTable (UX/UI C3).
// Estado de sort: null (ordem original) ou { key, dir: "asc" | "desc" }.

export function isColumnSortable(col) {
  if (col.kind === "spark") return false;
  return col.sortable !== false;
}

export function sortKeyFor(col) {
  return col.kind === "delta" ? "__delta" : col.key;
}

export function isNumericColumn(col, rows) {
  if (col.kind === "delta") return true;
  const key = sortKeyFor(col);
  const first = (rows || []).find((r) => r?.[key] != null);
  return typeof first?.[key] === "number";
}

export function nextSortState(current, col, rows) {
  const key = sortKeyFor(col);
  const firstDir = isNumericColumn(col, rows) ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: firstDir };
  if (current.dir === firstDir) {
    return { key, dir: firstDir === "desc" ? "asc" : "desc" };
  }
  return null;
}

function compareValues(a, b, dir) {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulos por último em qualquer direção
  if (bNull) return -1;
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  return dir === "desc" ? -cmp : cmp;
}

export function applySort(rows, sortState) {
  if (!sortState) return rows;
  const { key, dir } = sortState;
  return [...rows].sort((ra, rb) => compareValues(ra?.[key], rb?.[key], dir));
}
