import { useEffect, useState } from "react";
import api from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";

export default function InsightsPanel({ dataset, municipioId }) {
  const { user } = useAuth();
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isGlobal = user?.role === "ADMIN_GLOBAL";

  useEffect(() => {
    if (isGlobal && !municipioId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const params = { dataset, periodo: "latest" };
    if (municipioId) params.municipio_id = municipioId;
    api
      .get("/insights", { params })
      .then((res) => setInsight(res.data))
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.status === 400) {
          setInsight(null);
        } else {
          setError("Erro ao carregar insights.");
        }
      })
      .finally(() => setLoading(false));
  }, [dataset, municipioId, isGlobal]);

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

  if (!loading && !insight && !error && isGlobal && !municipioId) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border border-[var(--border)] rounded-2xl p-6"
      style={{ background: "var(--panel)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
          <SparklesIcon className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-semibold text-[var(--text)]">Insights IA</h3>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-[var(--panel-2)] rounded animate-pulse" style={{ width: `${85 - i * 8}%` }} />
              ))}
            </div>
          </motion.div>
        ) : error ? (
          <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-sm text-red-500">
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
                  className="flex gap-2.5 text-sm text-[var(--text-dim)]"
                >
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[var(--panel-2)] text-[var(--accent-3)] flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span>{bullet}</span>
                </motion.li>
              ))}
            </ul>
            <p className="text-xs text-[var(--text-mute)] mt-4">
              Gerado em {formatDate(insight.gerado_em)}
            </p>
          </motion.div>
        ) : (
          <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-sm text-[var(--text-mute)] py-2">
            Nenhum insight disponível para este período.
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
