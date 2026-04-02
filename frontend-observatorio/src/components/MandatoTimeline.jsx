import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  FlagIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  StarIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

const TIPO_CONFIG = {
  inicio_mandato: {
    label: "Início de Mandato",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    icon: FlagIcon,
  },
  obras: {
    label: "Obras",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    icon: WrenchScrewdriverIcon,
  },
  politica: {
    label: "Política Pública",
    color: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
    icon: DocumentTextIcon,
  },
  evento: {
    label: "Evento",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    icon: StarIcon,
  },
};

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MandatoTimeline({ municipioId }) {
  const { user } = useAuth();
  const [marcos, setMarcos] = useState([]);
  const [loading, setLoading] = useState(true);

  const canManage =
    user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  useEffect(() => {
    const params = municipioId ? { municipio_id: municipioId } : {};
    api
      .get("/marcos", { params })
      .then((r) => setMarcos(r.data || []))
      .catch(() => setMarcos([]))
      .finally(() => setLoading(false));
  }, [municipioId]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
        <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 w-48 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">Timeline do Mandato</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Marcos e eventos do município</p>
        </div>
        {canManage && (
          <Link
            to="/admin/mandato"
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800"
          >
            <PlusIcon className="w-4 h-4" />
            Gerenciar
          </Link>
        )}
      </div>

      {marcos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FlagIcon className="w-10 h-10 text-slate-200 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum marco registrado ainda.</p>
          {canManage && (
            <Link
              to="/admin/mandato"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <PlusIcon className="w-4 h-4" />
              Adicionar primeiro marco
            </Link>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Horizontal line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-100 dark:bg-slate-800" />

          {/* Scrollable marco cards */}
          <div className="flex gap-4 overflow-x-auto pb-2 relative">
            {marcos.map((marco, i) => {
              const cfg = TIPO_CONFIG[marco.tipo] || TIPO_CONFIG.evento;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={marco.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex-shrink-0 w-48 pt-9 relative"
                >
                  {/* Dot on timeline */}
                  <div className={`absolute top-3.5 left-6 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${cfg.dot} shadow`} />

                  <div className={`border rounded-xl p-3 ${cfg.color}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs font-semibold uppercase tracking-wide truncate">
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs font-bold leading-snug">{marco.titulo}</p>
                    <p className="text-xs opacity-70 mt-1">{fmtDate(marco.data)}</p>
                    {marco.descricao && (
                      <p className="text-xs opacity-60 mt-1 line-clamp-2">{marco.descricao}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
