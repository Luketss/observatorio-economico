import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { HBarChart, fmtMoneyFull, fmtUsdFull, fmtNumber } from "../../components/nid/charts";
import NidSelect from "../../components/nid/NidSelect";

const PAGE_SIZE = 25;

const DATASETS = [
  { key: "arrecadacao", label: "Arrecadação", endpoint: "/comparativo/arrecadacao", metrica: "total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pib", label: "PIB", endpoint: "/pib/ranking", metrica: "pib_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "caged", label: "CAGED", endpoint: "/comparativo/caged", metrica: "saldo_total", fmt: fmtNumber, hasAno: true },
  { key: "rais", label: "RAIS", endpoint: "/comparativo/rais", metrica: "total_vinculos", fmt: fmtNumber, hasAno: true },
  { key: "estban", label: "Bancos", endpoint: "/estban/comparativo", metrica: "credito_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "comex", label: "Comex", endpoint: "/comex/comparativo", metrica: "exportacoes", fmt: fmtUsdFull, hasAno: true },
  { key: "empresas", label: "Empresas", endpoint: "/empresas/comparativo", metrica: "total_empresas", fmt: fmtNumber, hasAno: false },
  { key: "bolsa_familia", label: "Bolsa Família", endpoint: "/bolsa_familia/comparativo", metrica: "valor_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "inss", label: "INSS", endpoint: "/inss/comparativo", metrica: "valor_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pix", label: "PIX", endpoint: "/pix/comparativo", metrica: "volume_total", fmt: fmtMoneyFull, hasAno: true },
  { key: "pe_de_meia", label: "Pé-de-Meia", endpoint: "/pe_de_meia/comparativo", metrica: "total_estudantes", fmt: fmtNumber, hasAno: true },
];

const METRIC_LABELS = {
  arrecadacao: "Total Arrecadado",
  pib: "PIB Total",
  caged: "Saldo CAGED",
  rais: "Vínculos Empregatícios",
  estban: "Crédito Total",
  comex: "Exportações (USD)",
  empresas: "Empresas Ativas",
  bolsa_familia: "Repasses Totais",
  inss: "Valor Total INSS",
  pix: "Volume PIX",
  pe_de_meia: "Estudantes Beneficiados",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

export default function RankingTab() {
  const { user } = useAuth();
  const [activeKey, setActiveKey] = useState("arrecadacao");
  const [ano, setAno] = useState(CURRENT_YEAR - 1);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [estados, setEstados] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const activeDataset = DATASETS.find((d) => d.key === activeKey);

  // Fetch unique state list from /municipios on mount
  useEffect(() => {
    api.get("/municipios", { params: { include_demo: false } }).then((res) => {
      const ufs = [...new Set((res.data || []).map((m) => m.estado).filter(Boolean))].sort();
      setEstados(ufs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeDataset) return;
    setLoading(true);
    setData([]);
    setPage(0);
    const params = activeDataset.hasAno ? { ano } : {};
    if (estadoFiltro) params.estado = estadoFiltro;
    api
      .get(activeDataset.endpoint, { params })
      .then((res) => setData(res.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [activeKey, ano, estadoFiltro]);

  const chartData = useMemo(() => {
    if (!activeDataset || !data.length) return [];
    return data.map((row) => ({
      municipio: row.estado ? `${row.municipio} (${row.estado})` : row.municipio,
      municipio_raw: row.municipio,
      municipio_id: row.municipio_id,
      estado: row.estado,
      valor: row[activeDataset.metrica] ?? 0,
    }));
  }, [data, activeDataset]);

  const myId = user?.municipio_id;

  const pageCount = Math.max(1, Math.ceil(chartData.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const startIdx = safePage * PAGE_SIZE;
  const pageRows = chartData.slice(startIdx, startIdx + PAGE_SIZE);
  const myIndex = myId ? chartData.findIndex((r) => r.municipio_id === myId) : -1;

  return (
    <div className="space-y-8">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* State filter */}
        {estados.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--text-dim)]">Estado:</label>
            <NidSelect value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} ariaLabel="Filtrar por estado">
              <option value="">Todos</option>
              {estados.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </NidSelect>
          </div>
        )}

        {/* Year selector */}
        {activeDataset?.hasAno && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--text-dim)]">Ano:</label>
            <NidSelect value={ano} onChange={(e) => setAno(+e.target.value)} ariaLabel="Filtrar por ano">
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </NidSelect>
          </div>
        )}
      </div>

      {/* Dataset tabs */}
      <div className="flex flex-wrap gap-2">
        {DATASETS.map((ds) => (
          <button
            key={ds.key}
            onClick={() => setActiveKey(ds.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeKey === ds.key
                ? "text-white shadow bg-[var(--accent-1)]"
                : "bg-[var(--panel)] text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--accent-1)]"
            }`}
          >
            {ds.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
        <h3 className="text-base font-bold mb-5 text-[var(--text)]">
          {METRIC_LABELS[activeKey]}{activeDataset?.hasAno ? ` — ${ano}` : ""}
        </h3>

        <HBarChart
          data={chartData.map((row) => ({ label: row.municipio, value: row.valor, municipio_id: row.municipio_id }))}
          highlight={myId ? chartData.find((r) => r.municipio_id === myId)?.municipio : undefined}
          color="var(--accent-1)"
          highlightColor="var(--accent-4)"
          showPosition={true}
          fmt={activeDataset?.fmt ?? ((v) => String(v))}
          loading={loading}
          emptyMessage="Sem dados disponíveis"
        />
      </div>

      {/* Ranking table */}
      {!loading && chartData.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">
                  #
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Município
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">
                  UF
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {METRIC_LABELS[activeKey]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {pageRows.map((row, i) => {
                const rank = startIdx + i + 1;
                return (
                  <tr
                    key={rank}
                    className={`transition-colors ${
                      myId && row.municipio_id === myId
                        ? "bg-amber-50 "
                        : "hover:bg-[var(--panel-2)]/40"
                    }`}
                  >
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs">{rank}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {row.municipio_raw}
                      {myId && row.municipio_id === myId && (
                        <span className="ml-2 text-xs text-amber-600  font-semibold">
                          (seu município)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)] font-mono text-xs">
                      {row.estado || "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-[var(--text)]">
                      {activeDataset?.fmt(row.valor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border)]">
            <div>
              {myId && myIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => setPage(Math.floor(myIndex / PAGE_SIZE))}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-[var(--panel)] text-[var(--accent-1)] border border-[var(--accent-1)] hover:bg-[var(--accent-1)]/10"
                >
                  Ir para meu município
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-[var(--panel)] text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--accent-1)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--border)]"
              >
                Anterior
              </button>
              <span className="text-xs font-medium text-[var(--text-dim)]">
                Página {safePage + 1} de {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-[var(--panel)] text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--accent-1)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--border)]"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
