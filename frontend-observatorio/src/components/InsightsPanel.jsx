import { useEffect, useState } from "react";
import api from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

export default function InsightsPanel({ dataset, municipioId }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const fetchInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { dataset, periodo: "latest" };
      if (municipioId) params.municipio_id = municipioId;

      // Try to get the most recent insight for this dataset
      // by fetching without periodo first — fallback to empty
      const res = await api.get("/insights", { params });
      setInsight(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setInsight(null);
      } else {
        setError("Erro ao carregar insights.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGerar = async () => {
    setGenerating(true);
    setError(null);
    try {
      const body = { dataset };
      if (municipioId) body.municipio_id = municipioId;
      const res = await api.post("/insights/gerar", body);
      setInsight(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || "Erro ao gerar insights.");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, [dataset, municipioId]);

  const formatDate = (dt) => {
    if (!dt) return "";
    return new Date(dt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <SparklesIcon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-800">Insights IA</h3>
        </div>

        <button
          onClick={handleGerar}
          disabled={generating}
          title="Gerar / Atualizar Insights"
          className="flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-100"
        >
          <ArrowPathIcon className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Gerando..." : insight ? "Atualizar" : "Gerar"}
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-violet-200 rounded animate-pulse" style={{ width: `${85 - i * 8}%` }} />
              ))}
            </div>
          </motion.div>
        ) : error ? (
          <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-sm text-red-600">
            {error}
          </motion.p>
        ) : insight ? (
          <motion.div key="insight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ul className="space-y-2.5">
              {insight.bullets.map((bullet, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="flex gap-2.5 text-sm text-gray-700"
                >
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span>{bullet}</span>
                </motion.li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-4">
              Gerado em {formatDate(insight.gerado_em)} · {insight.modelo}
            </p>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-center py-4">
            <p className="text-sm text-gray-500 mb-3">
              Nenhum insight gerado ainda para este dataset.
            </p>
            <button
              onClick={handleGerar}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <SparklesIcon className="w-4 h-4" />
              {generating ? "Gerando..." : "Gerar Insights com IA"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
