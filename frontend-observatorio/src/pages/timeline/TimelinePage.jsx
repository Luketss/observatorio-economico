import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import { CalendarDaysIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import MandatoTimeline from "../../components/MandatoTimeline";

export default function TimelinePage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDaysIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
              Timeline do Mandato
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Marcos e eventos relevantes do mandato municipal.
            </p>
          </div>
        </div>
        {canManage && (
          <Link
            to="/admin/mandato"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Gerenciar
          </Link>
        )}
      </div>

      <MandatoTimeline />
    </motion.div>
  );
}
