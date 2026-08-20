import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { SparklesIcon, ArrowRightIcon, PencilIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { usePermissao } from "../hooks/usePermissao";
import { useAuth } from "../context/AuthContext";
import PrioridadesEditorModal from "./PrioridadesEditorModal";
import { DATASET_ROUTE, DATASET_LABEL, parseTitulo } from "../utils/prioridadesForm";

const PREFIX_STYLES = {
  "Atenção": { badge: "bg-[var(--panel-2)] text-amber-400", label: "Atenção" },
  "Oportunidade": { badge: "bg-[var(--panel-2)] text-blue-400", label: "Oportunidade" },
  "Risco": { badge: "bg-[var(--panel-2)] text-red-400", label: "Risco" },
};
const DEFAULT_STYLE = { badge: "bg-[var(--panel-2)] text-[var(--text-dim)]", label: "Prioridade" };

function fmtDate(dt) {
  if (!dt) return "";
  return new Date(dt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PrioridadesPanel() {
  const [state, setState] = useState({ status: "loading", data: null });
  const { user } = useAuth();
  const canEditar = usePermissao("prioridades", "editar") && user?.role !== "ADMIN_GLOBAL";
  const [editorAberto, setEditorAberto] = useState(false);

  function handleSaved(data) {
    setState({ status: "ok", data });
  }

  useEffect(() => {
    api.get("/insights/prioridades")
      .then((res) => {
        const data = res.data;
        if (data?.prioridades?.length) setState({ status: "ok", data });
        else setState({ status: "empty", data: null });
      })
      .catch((err) => {
        if (err.response?.status === 404) setState({ status: "empty", data: null });
        else setState({ status: "error", data: null });
      });
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="h-5 w-48 bg-[var(--panel-2)] rounded animate-pulse" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-[var(--panel-2)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") return null;

  if (state.status === "empty") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-[var(--text)]">Prioridades do mês</h2>
        </div>
        <p className="text-sm text-[var(--text-mute)]">
          As prioridades ainda não foram geradas. Aguarde o próximo ciclo de análise.
        </p>
        {canEditar && (
          <button
            onClick={() => setEditorAberto(true)}
            className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-500 hover:opacity-80 cursor-pointer"
          >
            <PencilIcon className="w-4 h-4" />
            Adicionar prioridades
          </button>
        )}
        <PrioridadesEditorModal
          aberto={editorAberto}
          onClose={() => setEditorAberto(false)}
          inicial={null}
          municipioId={null}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  const { prioridades, gerado_em } = state.data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-violet-500" />
          <h2 className="text-base font-bold text-[var(--text)]">Prioridades do mês</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-mute)]">
            {state.data.modelo === "especialista" ? "editado em" : "gerado em"} {fmtDate(gerado_em)}
          </span>
          {canEditar && (
            <button
              onClick={() => setEditorAberto(true)}
              aria-label="Editar prioridades"
              className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {prioridades.map((p, i) => {
          const { tipo, texto: body } = parseTitulo(p.titulo);
          const style = tipo ? PREFIX_STYLES[tipo] : DEFAULT_STYLE;
          const route = p.dataset_referencia ? DATASET_ROUTE[p.dataset_referencia] : null;
          const datasetLabel = p.dataset_referencia ? DATASET_LABEL[p.dataset_referencia] : null;
          return (
            <div key={i} className="flex flex-col gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]">
              <span className={`inline-flex w-fit text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.badge}`}>
                {style.label}
              </span>
              <h3 className="text-sm font-semibold text-[var(--text)] leading-snug">{body}</h3>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">{p.observacao}</p>
              {route && datasetLabel && (
                <Link
                  to={route}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-3)] hover:opacity-80 mt-1"
                >
                  Ver em {datasetLabel}
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <PrioridadesEditorModal
        aberto={editorAberto}
        onClose={() => setEditorAberto(false)}
        inicial={state.data}
        municipioId={null}
        onSaved={handleSaved}
      />
    </motion.div>
  );
}
