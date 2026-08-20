import { useContext } from "react";
import { Link } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { PlanContext } from "../context/PlanContext";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";

/** Card de atalho da seção "Aprofundar" da página inicial. Teaser de plano:
 *  bloqueado fica visível com cadeado e continua navegável — o gate real é o
 *  PlanLockedView da rota destino. */
export default function AtalhoCard({ titulo, descricao, icone: Icone, to, planKey }) {
  const { canAccess } = useContext(PlanContext);
  const bloqueado = planKey != null && !canAccess(planKey);

  return (
    <Link
      to={to}
      title={bloqueado ? LOCK_TITLE : undefined}
      style={bloqueado ? { opacity: 0.7 } : undefined}
      className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-2)] transition-colors"
    >
      <Icone className="w-6 h-6 shrink-0 text-blue-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
          {titulo}
          {bloqueado && <LockClosedIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-mute)" }} />}
        </p>
        <p className="text-xs text-[var(--text-dim)] mt-0.5">{descricao}</p>
      </div>
    </Link>
  );
}
