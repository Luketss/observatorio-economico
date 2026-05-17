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
  XMarkIcon,
  PlusIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";

const LIMIT = 50;

// ── Domain grouping (frontend hardcode by table-name prefix) ──────────────────
const DOMAIN_RULES = [
  {
    label: "Trabalho & renda",
    test: (name) => /^(caged_|rais_|inss_)/.test(name),
  },
  {
    label: "Economia",
    test: (name) =>
      /^(pib_|arrecadacao_|comex_|empresas$|estban$|pix$)/.test(name),
  },
  {
    label: "Social",
    test: (name) => /^(bolsa_familia$|pe_de_meia$)/.test(name),
  },
  {
    label: "Operacional",
    test: (name) =>
      /^(municipios$|usuarios$|insights_ia$|notificacoes$|custom_cards$|plano_config$|marcos$)/.test(
        name
      ),
  },
];

function getDomain(tableName) {
  for (const rule of DOMAIN_RULES) {
    if (rule.test(tableName)) return rule.label;
  }
  return "Outros";
}

// Group tables: prefer backend `group` field if present, else frontend rules
function groupTables(tables) {
  const groups = {};
  for (const t of tables) {
    const key = t.group || getDomain(t.table);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

// ── Column type inference ─────────────────────────────────────────────────────
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function inferColType(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return "BOOL";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "INT" : "NUM";
  }
  if (typeof value === "string") {
    return ISO_DATE_RE.test(value) ? "TS" : "STR";
  }
  return "STR";
}

// Build a map of colName → type tag from the first data row
function buildTypeMap(columns, firstRow) {
  if (!firstRow) return {};
  const map = {};
  for (const col of columns) {
    const tag = inferColType(firstRow[col.name]);
    if (tag) map[col.name] = tag;
  }
  return map;
}

function isNumericType(type) {
  return ["integer", "float", "numeric", "biginteger"].includes(type);
}

// ── Filter picker (inline dropdown) ──────────────────────────────────────────
function FilterPicker({ columns, activeKeys, onAdd, onClose }) {
  const [col, setCol] = useState("");
  const [val, setVal] = useState("");
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const available = columns.filter((c) => !activeKeys.includes(c.name));

  function submit(e) {
    e.preventDefault();
    if (!col || val === "") return;
    onAdd(col, val);
    onClose();
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 50,
        background: "var(--panel)",
        border: "1px solid var(--border-strong)",
        borderRadius: "12px",
        padding: "12px",
        minWidth: "260px",
        boxShadow: "0 20px 40px -10px rgba(0,0,0,0.55)",
        backdropFilter: "blur(12px)",
      }}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <select
          value={col}
          onChange={(e) => setCol(e.target.value)}
          style={{
            padding: "7px 10px",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            outline: "none",
          }}
        >
          <option value="">— coluna —</option>
          {available.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="valor..."
          style={{
            padding: "7px 10px",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!col || val === ""}
          style={{
            padding: "6px 12px",
            background: "var(--admin-accent)",
            border: "none",
            borderRadius: "8px",
            color: "#fff",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            opacity: !col || val === "" ? 0.45 : 1,
          }}
        >
          Aplicar filtro
        </button>
      </form>
    </div>
  );
}

// ── Column type tag ───────────────────────────────────────────────────────────
function ColTypeTag({ tag }) {
  if (!tag) return null;
  const cls = `nid-explorer__coltype nid-explorer__coltype--${tag.toLowerCase()}`;
  return <span className={cls}>[{tag}]</span>;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ colName, sortBy, sortOrder }) {
  if (sortBy !== colName) return <ChevronUpDownIcon className="w-3.5 h-3.5 opacity-40" />;
  return sortOrder === "asc" ? (
    <ChevronUpIcon className="w-3.5 h-3.5" style={{ color: "var(--admin-accent)" }} />
  ) : (
    <ChevronDownIcon className="w-3.5 h-3.5" style={{ color: "var(--admin-accent)" }} />
  );
}

// ── Cell renderer ─────────────────────────────────────────────────────────────
function renderCellValue(col, value) {
  if (value === null || value === undefined) {
    return <span style={{ color: "var(--text-mute)" }}>—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          value
            ? "bg-[var(--panel-2)] text-emerald-400"
            : "bg-[var(--panel-2)] text-red-400"
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

// ── Main component ────────────────────────────────────────────────────────────
export default function ExplorerPage() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("asc");
  // filters: array of { column, value } for chip display
  const [filterChips, setFilterChips] = useState([]);
  const [debouncedFilters, setDebouncedFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [typeMap, setTypeMap] = useState({});
  const debounceRef = useRef(null);
  const pickerAnchorRef = useRef(null);

  // Load table list on mount
  useEffect(() => {
    api
      .get("/admin/explore")
      .then((res) => setTables(res.data || []))
      .catch(() => setTables([]))
      .finally(() => setLoadingTables(false));
  }, []);

  // Debounce filter chip changes → convert to params object
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const obj = {};
      for (const chip of filterChips) {
        obj[chip.column] = chip.value;
      }
      setDebouncedFilters(obj);
      setPage(0);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [filterChips]);

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
    for (const [k, v] of Object.entries(debouncedFilters)) {
      if (v !== "" && v !== undefined) params[k] = v;
    }

    api
      .get(`/admin/explore/${selectedTable}`, { params })
      .then((res) => {
        const items = res.data.items || [];
        setData(items);
        setTotal(res.data.total || 0);
        // Infer types from first row
        if (items.length > 0) {
          setTypeMap(buildTypeMap(columns, items[0]));
        }
      })
      .catch(() => {
        setData([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [selectedTable, page, sortBy, sortOrder, debouncedFilters, columns]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleTableSelect(tableName) {
    setSelectedTable(tableName);
    setFilterChips([]);
    setDebouncedFilters({});
    setPage(0);
    setSortBy("id");
    setSortOrder("asc");
    const found = tables.find((t) => t.table === tableName);
    setColumns(found ? found.columns : []);
    setData([]);
    setTotal(0);
    setTypeMap({});
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

  function addFilterChip(column, value) {
    setFilterChips((prev) => {
      // replace if column already exists
      const exists = prev.find((c) => c.column === column);
      if (exists) {
        return prev.map((c) => (c.column === column ? { column, value } : c));
      }
      return [...prev, { column, value }];
    });
  }

  function removeFilterChip(column) {
    setFilterChips((prev) => prev.filter((c) => c.column !== column));
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
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedTable}_pagina${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const grouped = groupTables(tables);
  const activeFilterKeys = filterChips.map((c) => c.column);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--admin-accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircleStackIcon
              style={{ width: 20, height: 20, color: "var(--admin-accent)" }}
            />
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Explorador de Dados
            </h1>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                margin: "3px 0 0",
                fontFamily: "var(--font-mono)",
              }}
            >
              Consulte qualquer tabela do banco com filtros e ordenação
            </p>
          </div>
        </div>
        {selectedTable && data.length > 0 && (
          <button
            onClick={exportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--admin-accent)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.03em",
            }}
          >
            <ArrowDownTrayIcon style={{ width: 15, height: 15 }} />
            Exportar CSV
          </button>
        )}
      </div>

      {/* ── 3-column explorer layout ── */}
      <div className="nid-explorer">
        {/* Left rail: table browser */}
        <div className="nid-explorer__browser">
          {loadingTables ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 24,
                    borderRadius: 6,
                    background: "var(--panel-2)",
                    opacity: 0.6,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <h5>{group}</h5>
                <ul>
                  {items.map((t) => (
                    <li
                      key={t.table}
                      className={selectedTable === t.table ? "sel" : ""}
                      onClick={() => handleTableSelect(t.table)}
                      title={t.table}
                    >
                      {t.label || t.table}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {!loadingTables && tables.length === 0 && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-mute)",
                fontFamily: "var(--font-mono)",
                textAlign: "center",
                marginTop: 20,
              }}
            >
              Nenhuma tabela disponível
            </p>
          )}
        </div>

        {/* Right: results panel */}
        <div className="nid-explorer__results">
          {/* Filter chips bar — always visible when a table is selected */}
          {selectedTable && (
            <div className="nid-explorer__filters">
              <FunnelIcon
                style={{
                  width: 13,
                  height: 13,
                  color: "var(--text-mute)",
                  flexShrink: 0,
                }}
              />
              {filterChips.map((chip) => (
                <span key={chip.column} className="nid-explorer__chip">
                  <span>
                    {chip.column}={chip.value}
                  </span>
                  <span
                    className="nid-explorer__chip-x"
                    onClick={() => removeFilterChip(chip.column)}
                    title="Remover filtro"
                  >
                    <XMarkIcon style={{ width: 11, height: 11 }} />
                  </span>
                </span>
              ))}
              {/* + Filtro pseudo-chip */}
              <div style={{ position: "relative" }} ref={pickerAnchorRef}>
                <span
                  className="nid-explorer__chip nid-explorer__chip--add"
                  onClick={() => setShowPicker((v) => !v)}
                >
                  <PlusIcon style={{ width: 10, height: 10 }} />
                  Filtro
                </span>
                {showPicker && columns.length > 0 && (
                  <FilterPicker
                    columns={columns}
                    activeKeys={activeFilterKeys}
                    onAdd={addFilterChip}
                    onClose={() => setShowPicker(false)}
                  />
                )}
              </div>
              {/* Sort controls — inline right side */}
              {columns.length > 0 && (
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(0);
                    }}
                    style={{
                      padding: "4px 8px",
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 7,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      outline: "none",
                    }}
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value);
                      setPage(0);
                    }}
                    style={{
                      padding: "4px 8px",
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 7,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      outline: "none",
                    }}
                  >
                    <option value="asc">↑ asc</option>
                    <option value="desc">↓ desc</option>
                  </select>
                  {!loading && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-mute)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {total.toLocaleString("pt-BR")} reg.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data table */}
          {selectedTable ? (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {loading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "64px 0",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "3px solid var(--admin-accent)",
                      borderTopColor: "transparent",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                </div>
              ) : data.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "64px 0",
                    color: "var(--text-mute)",
                  }}
                >
                  <CircleStackIcon style={{ width: 40, height: 40, opacity: 0.3 }} />
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      marginTop: 12,
                    }}
                  >
                    Nenhum registro encontrado
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: "var(--panel-2)",
                        }}
                      >
                        {columns.map((col) => (
                          <th
                            key={col.name}
                            onClick={() => handleSort(col.name)}
                            style={{
                              padding: "10px 14px",
                              textAlign: "left",
                              font: "600 10.5px/1 var(--font-mono)",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: "var(--text-mute)",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              {col.name}
                              <ColTypeTag tag={typeMap[col.name]} />
                              <SortIcon
                                colName={col.name}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                              />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="wait">
                        {data.map((row, idx) => (
                          <motion.tr
                            key={row.id ?? idx}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12, delay: idx * 0.008 }}
                            style={{ borderBottom: "1px solid var(--border)" }}
                          >
                            {columns.map((col) => (
                              <td
                                key={col.name}
                                style={{
                                  padding: "10px 14px",
                                  fontSize: 13,
                                  color: "var(--text)",
                                  whiteSpace: "nowrap",
                                  fontFamily: isNumericType(col.type)
                                    ? "var(--font-mono)"
                                    : "var(--font-display)",
                                  textAlign: isNumericType(col.type)
                                    ? "right"
                                    : "left",
                                }}
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderTop: "1px solid var(--border)",
                    background: "var(--panel-2)",
                  }}
                >
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 7,
                      color: page === 0 ? "var(--text-mute)" : "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      cursor: page === 0 ? "not-allowed" : "pointer",
                      opacity: page === 0 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeftIcon style={{ width: 14, height: 14 }} />
                    Anterior
                  </button>

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--text-dim)",
                    }}
                  >
                    Página{" "}
                    <strong style={{ color: "var(--text)" }}>{page + 1}</strong>{" "}
                    de{" "}
                    <strong style={{ color: "var(--text)" }}>{totalPages}</strong>
                    {" · "}
                    <span style={{ color: "var(--text-mute)", fontSize: 11 }}>
                      {total.toLocaleString("pt-BR")} registros
                    </span>
                  </span>

                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 7,
                      color:
                        page >= totalPages - 1
                          ? "var(--text-mute)"
                          : "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                      opacity: page >= totalPages - 1 ? 0.4 : 1,
                    }}
                  >
                    Próximo
                    <ChevronRightIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Empty state — no table selected */
            !loadingTables && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "40vh",
                  color: "var(--text-mute)",
                }}
              >
                <CircleStackIcon
                  style={{ width: 56, height: 56, opacity: 0.22 }}
                />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    marginTop: 16,
                    marginBottom: 4,
                  }}
                >
                  Selecione uma tabela
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--text-mute)",
                  }}
                >
                  {tables.length} tabelas em {Object.keys(grouped).length} grupos
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
