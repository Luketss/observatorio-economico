import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CircleStackIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";

const LIMIT = 50;

function groupTables(tables) {
  const groups = {};
  for (const t of tables) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }
  return groups;
}

function isNumericType(type) {
  return ["integer", "float", "numeric", "biginteger", "biginteger"].includes(type);
}

export default function ExplorerPage() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("asc");
  const [filters, setFilters] = useState({});
  const [debouncedFilters, setDebouncedFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);
  const debounceRef = useRef(null);

  // Load table list on mount
  useEffect(() => {
    api
      .get("/admin/explore")
      .then((res) => setTables(res.data || []))
      .catch(() => setTables([]))
      .finally(() => setLoadingTables(false));
  }, []);

  // Debounce filter changes
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [filters]);

  // Fetch data when table/page/sort/filters change
  const fetchData = useCallback(() => {
    if (!selectedTable) return;
    setLoading(true);

    const params = {
      skip: page * LIMIT,
      limit: LIMIT,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    // Add non-empty filter params
    for (const [k, v] of Object.entries(debouncedFilters)) {
      if (v !== "" && v !== undefined) params[k] = v;
    }

    api
      .get(`/admin/explore/${selectedTable}`, { params })
      .then((res) => {
        setData(res.data.items || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => {
        setData([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [selectedTable, page, sortBy, sortOrder, debouncedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleTableSelect(e) {
    const tname = e.target.value;
    setSelectedTable(tname);
    setFilters({});
    setDebouncedFilters({});
    setPage(0);
    setSortBy("id");
    setSortOrder("asc");
    const found = tables.find((t) => t.table === tname);
    setColumns(found ? found.columns : []);
    setData([]);
    setTotal(0);
  }

  function handleSort(colName) {
    if (sortBy === colName) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(colName);
      setSortOrder("asc");
    }
    setPage(0);
  }

  function handleFilterChange(colName, value) {
    setFilters((prev) => ({ ...prev, [colName]: value }));
  }

  function exportCSV() {
    if (!data.length || !columns.length) return;
    const header = columns.map((c) => c.name).join(",");
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const v = row[c.name];
          return v == null ? "" : JSON.stringify(String(v));
        })
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedTable}_pagina${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const grouped = groupTables(tables);

  function renderCellValue(col, value) {
    if (value === null || value === undefined) {
      return <span className="text-slate-400 dark:text-slate-500">—</span>;
    }
    if (typeof value === "boolean") {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            value
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {value ? "true" : "false"}
        </span>
      );
    }
    const str = String(value);
    return (
      <span className="max-w-xs truncate block" title={str}>
        {str}
      </span>
    );
  }

  function SortIcon({ colName }) {
    if (sortBy !== colName) return <ChevronUpDownIcon className="w-3.5 h-3.5 opacity-40" />;
    return sortOrder === "asc" ? (
      <ChevronUpIcon className="w-3.5 h-3.5 text-violet-500" />
    ) : (
      <ChevronDownIcon className="w-3.5 h-3.5 text-violet-500" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <CircleStackIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Explorador de Dados</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Consulte qualquer tabela do banco de dados com filtros e ordenação
            </p>
          </div>
        </div>
        {selectedTable && data.length > 0 && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Exportar CSV
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap gap-4 items-center">
        {/* Table selector */}
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Tabela
          </label>
          {loadingTables ? (
            <div className="h-9 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          ) : (
            <select
              value={selectedTable}
              onChange={handleTableSelect}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">— Selecione uma tabela —</option>
              {Object.entries(grouped).map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((t) => (
                    <option key={t.table} value={t.table}>
                      {t.label} ({t.table})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* Sort by */}
        {columns.length > 0 && (
          <div className="min-w-40">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort order */}
        {columns.length > 0 && (
          <div className="min-w-28">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Direção
            </label>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value); setPage(0); }}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="asc">Crescente ↑</option>
              <option value="desc">Decrescente ↓</option>
            </select>
          </div>
        )}

        {/* Stats badge */}
        {selectedTable && !loading && (
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total de registros</p>
            <p className="text-lg font-bold text-slate-800 dark:text-white">
              {total.toLocaleString("pt-BR")}
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      {selectedTable && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
              <CircleStackIcon className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm">Nenhum registro encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  {/* Column headers with sort */}
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {columns.map((col) => (
                      <th
                        key={col.name}
                        onClick={() => handleSort(col.name)}
                        className="px-3 py-3 md:px-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:text-violet-600 dark:hover:text-violet-400 select-none whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.name}
                          <SortIcon colName={col.name} />
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Filter row */}
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    {columns.map((col) => (
                      <td key={col.name} className="px-2 py-1.5 md:px-3">
                        <input
                          type="text"
                          value={filters[col.name] || ""}
                          onChange={(e) => handleFilterChange(col.name, e.target.value)}
                          placeholder="filtrar..."
                          className="w-full min-w-16 text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  <AnimatePresence mode="wait">
                    {data.map((row, idx) => (
                      <motion.tr
                        key={row.id ?? idx}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12, delay: idx * 0.01 }}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        {columns.map((col) => (
                          <td
                            key={col.name}
                            className={`px-3 py-2.5 md:px-4 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap ${
                              isNumericType(col.type) ? "text-right font-mono" : ""
                            }`}
                          >
                            {renderCellValue(col, row[col.name])}
                          </td>
                        ))}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Anterior
              </button>

              <span className="text-sm text-slate-500 dark:text-slate-400">
                Página{" "}
                <span className="font-semibold text-slate-800 dark:text-white">{page + 1}</span> de{" "}
                <span className="font-semibold text-slate-800 dark:text-white">{totalPages}</span>
                {" "}·{" "}
                <span className="text-xs">{total.toLocaleString("pt-BR")} registros</span>
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próximo
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedTable && !loadingTables && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500">
          <CircleStackIcon className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-base font-medium">Selecione uma tabela para começar</p>
          <p className="text-sm mt-1 opacity-70">
            {tables.length} tabelas disponíveis em {Object.keys(grouped).length} grupos
          </p>
        </div>
      )}
    </div>
  );
}
