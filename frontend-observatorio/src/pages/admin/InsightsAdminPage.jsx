import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import {
  SparklesIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
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
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function InsightsAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [insights, setInsights] = useState({}); // { dataset: InsightResponse | null }
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generating, setGenerating] = useState({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [acting, setActing] = useState({}); // { id: bool }

  useEffect(() => {
    api.get("/municipios").then((r) => setMunicipios(r.data || []));
  }, []);

  const loadInsights = (id) => {
    setLoadingInsights(true);
    setInsights({});
    api
      .get("/insights/admin", { params: { municipio_id: id } })
      .then((r) => {
        const map = {};
        (r.data || []).forEach((ins) => { map[ins.dataset] = ins; });
        setInsights(map);
      })
      .catch(() => setInsights({}))
      .finally(() => setLoadingInsights(false));
  };

  useEffect(() => {
    if (!selectedId) return;
    loadInsights(selectedId);
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

  const handleToggleAtivo = async (insight) => {
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      const res = await api.patch(`/insights/${insight.id}`, { ativo: !insight.ativo });
      setInsights((prev) => ({ ...prev, [insight.dataset]: res.data }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
  };

  const handleTogglePlanoFree = async (insight) => {
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      const currently_hidden = insight.oculto_planos?.includes("free");
      const next = currently_hidden
        ? insight.oculto_planos.filter((p) => p !== "free")
        : [...(insight.oculto_planos || []), "free"];
      const res = await api.patch(`/insights/${insight.id}`, { oculto_planos: next });
      setInsights((prev) => ({ ...prev, [insight.dataset]: res.data }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
  };

  const handleDelete = async (insight) => {
    if (!confirm(`Excluir insight de "${insight.dataset}"? Esta ação não pode ser desfeita.`)) return;
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      await api.delete(`/insights/${insight.id}`);
      setInsights((prev) => ({ ...prev, [insight.dataset]: null }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Insights IA
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Gere, gerencie visibilidade e exclua insights por município.
        </p>
      </div>

      {/* Municipality selector */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
          Município
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-sm border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Selecione um município...</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.estado}
            </option>
          ))}
        </select>
      </div>

      {/* Dataset table */}
      {selectedId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Datasets</h3>
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
                <div key={d.key} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="px-6 py-3">Dataset</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Última geração</th>
                  <th className="px-6 py-3">Visibilidade</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {DATASETS.map((d) => {
                  const existing = insights[d.key];
                  const isGenerating = generating[d.key];
                  const isActing = existing && acting[existing.id];
                  const hiddenFromFree = existing?.oculto_planos?.includes("free");

                  return (
                    <tr key={d.key} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      {/* Dataset name */}
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                        {d.label}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {!existing ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Não gerado
                          </span>
                        ) : !existing.ativo ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-lg">
                            <EyeSlashIcon className="w-3.5 h-3.5" />
                            Oculto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Ativo
                          </span>
                        )}
                      </td>

                      {/* Last generated */}
                      <td className="px-6 py-4 text-slate-400 dark:text-slate-500 text-xs">
                        {existing ? fmtDate(existing.gerado_em) : "—"}
                      </td>

                      {/* Visibility controls */}
                      <td className="px-6 py-4">
                        {existing && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTogglePlanoFree(existing)}
                              disabled={isActing}
                              title={hiddenFromFree ? "Mostrar para plano gratuito" : "Ocultar para plano gratuito"}
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                                hiddenFromFree
                                  ? "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  : "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100"
                              }`}
                            >
                              {hiddenFromFree ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                              {hiddenFromFree ? "Oculto (free)" : "Visível (free)"}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Generate / Regenerate */}
                          <button
                            onClick={() => handleGerar(d.key)}
                            disabled={isGenerating || generatingAll}
                            title={existing ? "Regenerar" : "Gerar"}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 dark:hover:text-violet-400 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40"
                          >
                            <ArrowPathIcon className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                            {isGenerating ? "Gerando..." : existing ? "Regenerar" : "Gerar"}
                          </button>

                          {existing && (
                            <>
                              {/* Toggle ativo (hide from everyone) */}
                              <button
                                onClick={() => handleToggleAtivo(existing)}
                                disabled={isActing}
                                title={existing.ativo ? "Ocultar para todos" : "Mostrar para todos"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors disabled:opacity-40"
                              >
                                {existing.ativo
                                  ? <EyeSlashIcon className="w-4 h-4" />
                                  : <EyeIcon className="w-4 h-4 text-orange-500" />
                                }
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(existing)}
                                disabled={isActing}
                                title="Excluir insight"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Legend */}
      {selectedId && !loadingInsights && (
        <div className="flex items-center gap-6 text-xs text-slate-400 dark:text-slate-500 px-1">
          <span className="flex items-center gap-1.5"><EyeSlashIcon className="w-3.5 h-3.5" /> Ocultar para todos os usuários do município</span>
          <span className="flex items-center gap-1.5"><EyeIcon className="w-3.5 h-3.5" /> Controla visibilidade no plano gratuito</span>
          <span className="flex items-center gap-1.5"><TrashIcon className="w-3.5 h-3.5" /> Remove permanentemente</span>
        </div>
      )}
    </motion.div>
  );
}
