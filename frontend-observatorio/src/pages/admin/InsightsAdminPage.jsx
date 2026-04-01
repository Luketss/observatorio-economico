import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import {
  SparklesIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

const DATASETS = [
  { key: "geral", label: "Visão Geral" },
  { key: "arrecadacao", label: "Arrecadação" },
  { key: "pib", label: "PIB" },
  { key: "caged", label: "CAGED" },
  { key: "rais", label: "RAIS" },
  { key: "bolsa_familia", label: "Bolsa Família" },
  { key: "pe_de_meia", label: "Pé-de-Meia" },
  { key: "inss", label: "INSS" },
  { key: "estban", label: "Bancos (Estban)" },
  { key: "comex", label: "Comércio Exterior" },
  { key: "empresas", label: "Empresas" },
];

function fmtDate(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InsightsAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [insights, setInsights] = useState({}); // { dataset: InsightResponse | null }
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generating, setGenerating] = useState({}); // { dataset: bool }
  const [generatingAll, setGeneratingAll] = useState(false);

  // Load municipalities on mount
  useEffect(() => {
    api.get("/municipios/").then((r) => {
      setMunicipios(r.data || []);
    });
  }, []);

  // Load existing insights when municipality changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingInsights(true);
    setInsights({});

    Promise.allSettled(
      DATASETS.map((d) =>
        api
          .get("/insights", { params: { dataset: d.key, periodo: "latest", municipio_id: selectedId } })
          .then((r) => ({ dataset: d.key, data: r.data }))
          .catch(() => ({ dataset: d.key, data: null }))
      )
    ).then((results) => {
      const map = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          map[r.value.dataset] = r.value.data;
        }
      });
      setInsights(map);
      setLoadingInsights(false);
    });
  }, [selectedId]);

  const handleGerar = async (dataset) => {
    setGenerating((prev) => ({ ...prev, [dataset]: true }));
    try {
      const res = await api.post("/insights/gerar", {
        dataset,
        municipio_id: parseInt(selectedId),
      });
      setInsights((prev) => ({ ...prev, [dataset]: res.data }));
    } catch (err) {
      console.error("Erro ao gerar insight:", err.response?.data?.detail || err.message);
    } finally {
      setGenerating((prev) => ({ ...prev, [dataset]: false }));
    }
  };

  const handleGerarTodos = async () => {
    setGeneratingAll(true);
    for (const d of DATASETS) {
      await handleGerar(d.key);
    }
    setGeneratingAll(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
          Insights IA
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Selecione um município e gere análises com inteligência artificial para cada dataset.
        </p>
      </div>

      {/* Municipality selector */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
          Município
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-sm border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Selecione um município...</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.estado}
            </option>
          ))}
        </select>
      </div>

      {/* Dataset grid */}
      {selectedId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">Datasets</h3>
            <button
              onClick={handleGerarTodos}
              disabled={generatingAll || loadingInsights}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              <SparklesIcon className={`w-4 h-4 ${generatingAll ? "animate-pulse" : ""}`} />
              {generatingAll ? "Gerando todos..." : "Gerar Todos"}
            </button>
          </div>

          {loadingInsights ? (
            <div className="p-6 space-y-3">
              {DATASETS.map((d) => (
                <div key={d.key} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-400 tracking-wider">
                  <th className="px-6 py-3">Dataset</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Última geração</th>
                  <th className="px-6 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {DATASETS.map((d) => {
                  const existing = insights[d.key];
                  const isGenerating = generating[d.key];
                  return (
                    <tr key={d.key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{d.label}</td>
                      <td className="px-6 py-4">
                        {existing ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Gerado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Não gerado
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {existing ? fmtDate(existing.gerado_em) : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleGerar(d.key)}
                          disabled={isGenerating || generatingAll}
                          title={existing ? "Regenerar" : "Gerar"}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-50"
                        >
                          <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                          {isGenerating ? "Gerando..." : existing ? "Regenerar" : "Gerar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </motion.div>
  );
}
