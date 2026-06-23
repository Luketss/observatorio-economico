import { LockClosedIcon, SparklesIcon } from "@heroicons/react/24/outline";

/**
 * Full-page upsell teaser shown when the user opens a page their plan doesn't
 * include. Instead of hiding the feature, we show a blurred "taste" of it plus
 * a lock + upgrade message — to entice an upgrade.
 */
export default function PlanLockedView({ label = "Esta funcionalidade" }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="relative rounded-2xl overflow-hidden border"
        style={{ background: "var(--panel)", borderColor: "var(--border)" }}
      >
        {/* Blurred mock preview — a "gostinho" of what's behind the lock */}
        <div className="blur-md opacity-40 pointer-events-none select-none p-6 space-y-4" aria-hidden="true">
          <div className="h-6 w-1/3 rounded" style={{ background: "var(--panel-2)" }} />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl" style={{ background: "var(--panel-2)" }} />
            ))}
          </div>
          <div className="h-48 rounded-xl" style={{ background: "var(--panel-2)" }} />
        </div>

        {/* Overlay */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6"
          style={{ background: "color-mix(in oklab, var(--panel) 72%, transparent)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--panel-2)" }}
          >
            <LockClosedIcon className="w-7 h-7" style={{ color: "var(--text-mute)" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>
              {label} está bloqueado
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
              Esta funcionalidade está disponível em um plano superior.
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
              Fale com seu administrador para liberar o acesso e desbloquear mais análises.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: "var(--panel-2)", color: "var(--accent-1)", border: "1px solid var(--border)" }}
          >
            <SparklesIcon className="w-4 h-4" /> Upgrade de plano
          </span>
        </div>
      </div>
    </div>
  );
}
