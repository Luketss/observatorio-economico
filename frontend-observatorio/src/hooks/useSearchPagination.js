import { useEffect, useMemo, useState } from "react";

/**
 * Search + client-side pagination for admin lists.
 *
 * Usage:
 *   const sp = useSearchPagination(municipios, (m, q) =>
 *     m.nome.toLowerCase().includes(q) || m.estado.toLowerCase().includes(q)
 *   );
 *   <input value={sp.search} onChange={(e) => sp.setSearch(e.target.value)} />
 *   <AdminTable data={sp.paged} ... />
 *   <AdminPagination {...sp} total={items.length} />
 *
 * Page automatically resets to 0 when the search query or page size changes,
 * so the user never lands on an empty middle page. Empty/whitespace queries
 * skip the matchFn (full list passes through).
 */
export function useSearchPagination(items, matchFn, { defaultPageSize = 25 } = {}) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => matchFn(it, q));
  }, [items, search, matchFn]);

  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));

  const paged = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = page * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Keep the user out of empty middle pages
  useEffect(() => { setPage(0); }, [search, pageSize]);

  return {
    search, setSearch,
    page, setPage,
    pageSize, setPageSize,
    filtered, paged, totalPages,
  };
}
