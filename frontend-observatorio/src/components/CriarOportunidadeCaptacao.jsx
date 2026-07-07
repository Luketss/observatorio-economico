import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircleIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../context/PlanContext";
import { useToast } from "../context/ToastContext";

/** CTA "diagnóstico → ação": cria um CaptacaoRecurso pré-preenchido no estágio
 * "oportunidade" e navega ao kanban de Captação (Desenv. Econômico). Só aparece
 * para quem pode escrever no módulo (ADMIN_MUNICIPIO) e o tem no plano — o
 * backend já bloqueia VISUALIZADOR/ADMIN_GLOBAL de qualquer forma. */
export default function CriarOportunidadeCaptacao({ payload, label = "Registrar no funil de captação", compact = false }) {
  const { user } = useAuth();
  const { canAccess } = usePlan();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (user?.role !== "ADMIN_MUNICIPIO" || !canAccess("desenvolvimento_economico.captacao")) return null;

  const criar = async () => {
    setSaving(true);
    try {
      await api.post("/desenvolvimento-economico/captacao", { estagio: "oportunidade", ...payload });
      addToast("Oportunidade criada no funil de captação", "success");
      navigate("/app/desenvolvimento-economico/captacao");
    } catch {
      addToast("Erro ao criar oportunidade", "error");
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <button onClick={criar} disabled={saving} title={label}
        className="text-xs font-semibold text-[var(--accent-1)] hover:underline disabled:opacity-50 whitespace-nowrap">
        {saving ? "..." : "+ funil"}
      </button>
    );
  }
  return (
    <button onClick={criar} disabled={saving}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:shadow-md transition-shadow disabled:opacity-50">
      <PlusCircleIcon className="w-5 h-5" />
      {saving ? "Criando…" : label}
    </button>
  );
}
