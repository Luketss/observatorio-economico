import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { montarMudancas } from "../utils/mudancasRelevantes";

/** Bloco "Mudanças relevantes" da página inicial: variações reais disponíveis
 *  nos resumos, ordenadas por magnitude, cada uma com atalho para a origem. */
export default function MudancasRelevantes({ resumos }) {
  const itens = montarMudancas(resumos);
  if (itens.length === 0) return null;

  return (
    <div className="space-y-2" style={{ marginBottom: 22 }}>
      <h3 className="text-sm font-semibold text-[var(--text-dim)] uppercase tracking-wider">Mudanças relevantes</h3>
      <div className="space-y-1.5">
        {itens.map((i) => (
          <div key={i.key}
            className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--panel)]">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 bg-[var(--panel-2)] ${i.up ? "text-green-400" : "text-red-400"}`}>
              {i.pct != null
                ? `${i.pct >= 0 ? "+" : "−"}${Math.abs(i.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                : i.up ? "▲" : "▼"}
            </span>
            <p className="text-xs text-[var(--text)] flex-1 min-w-0">{i.texto}</p>
            <Link to={i.rota} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium shrink-0">
              Ver em {i.label} <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
