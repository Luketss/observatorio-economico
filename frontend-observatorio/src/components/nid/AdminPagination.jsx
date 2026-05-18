import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

const PAGE_SIZE_OPTIONS = [25, 50, 100, "all"];

/**
 * Pagination footer for admin tables. Renders nothing when the list is empty.
 *
 * Wire from useSearchPagination:
 *   <AdminPagination
 *     filteredCount={sp.filtered.length}
 *     page={sp.page} setPage={sp.setPage}
 *     pageSize={sp.pageSize} setPageSize={sp.setPageSize}
 *     totalPages={sp.totalPages}
 *   />
 */
export default function AdminPagination({
  filteredCount,
  page,
  setPage,
  pageSize,
  setPageSize,
  totalPages,
}) {
  if (filteredCount === 0) return null;

  return (
    <div className="nid-admin-pagination">
      <div className="nid-admin-pagination__range">
        {pageSize === "all" ? (
          <>Mostrando todos os {filteredCount}</>
        ) : (
          <>
            {Math.min(page * pageSize + 1, filteredCount)}
            –
            {Math.min((page + 1) * pageSize, filteredCount)}
            {" "}de{" "}{filteredCount}
          </>
        )}
      </div>

      <div className="nid-admin-pagination__controls">
        <label className="nid-admin-pagination__label">
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const v = e.target.value;
              setPageSize(v === "all" ? "all" : parseInt(v, 10));
            }}
            className="nid-admin-pagination__select"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "Todos" : opt}
              </option>
            ))}
          </select>
        </label>

        {pageSize !== "all" && totalPages > 1 && (
          <div className="nid-admin-pagination__pager">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Página anterior"
              className="nid-admin-pagination__btn"
            >
              <ChevronLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            <span className="nid-admin-pagination__page">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Próxima página"
              className="nid-admin-pagination__btn"
            >
              <ChevronRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
