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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-[2px] rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <LockClosedIcon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
        </div>
        <div className="text-center px-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Disponível apenas no plano pago
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Faça upgrade para acessar este conteúdo
          </p>
        </div>
      </div>
    </div>
  );
}
