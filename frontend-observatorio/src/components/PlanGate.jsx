import { LockClosedIcon } from "@heroicons/react/24/outline";
import { usePlan } from "../context/PlanContext";

/**
 * Wraps a component with a blur + padlock overlay when the current
 * municipality's plan doesn't include the given `planKey`.
 *
 * Usage:
 *   <PlanGate planKey="caged.por_sexo">
 *     <ChartCard>...</ChartCard>
 *   </PlanGate>
 */
export default function PlanGate({ planKey, children }) {
  const { canAccess } = usePlan();

  if (canAccess(planKey)) return children;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred preview of content */}
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--panel)]/70 backdrop-blur-[2px] rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-[var(--panel-2)] flex items-center justify-center">
          <LockClosedIcon className="w-6 h-6 text-[var(--text-mute)]" />
        </div>
        <div className="text-center px-4">
          <p className="text-sm font-semibold text-[var(--text)]">
            Disponível apenas no plano pago
          </p>
          <p className="text-xs text-[var(--text-dim)] mt-1">
            Faça upgrade para acessar este conteúdo
          </p>
        </div>
      </div>
    </div>
  );
}
