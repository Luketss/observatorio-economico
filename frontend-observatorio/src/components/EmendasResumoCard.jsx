import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

/** Teaser livre do Radar de Emendas. Autossuficiente: fetch próprio, null sem dados. */
export default function EmendasResumoCard() {
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    api.get("/emendas/resumo").then((r) => setResumo(r.data)).catch(() => setResumo(null));
  }, []);

  if (!resumo?.disponivel) return null;

  return (
    <Link to="/app/emendas" className="block" aria-label="Ver radar de emendas">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 md:p-5 border transition-shadow hover:shadow-md"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex-shrink-0">
            <BuildingLibraryIcon className="w-5 h-5 text-[var(--accent-1)]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">
              Radar de emendas parlamentares
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              <b>{fmtMi(resumo.total_empenhado)}</b> em emendas destinadas ao município em {resumo.ano}
              {resumo.num_parlamentares != null && <> · <b>{resumo.num_parlamentares}</b> parlamentar(es)</>}
              {resumo.top_autor && <> · maior padrinho: <b>{resumo.top_autor}</b></>}.
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Portal da Transparência · inclui emendas Pix · valores empenhados
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
