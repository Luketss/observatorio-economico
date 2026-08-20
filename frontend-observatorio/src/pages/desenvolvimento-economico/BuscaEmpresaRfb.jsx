import { useEffect, useRef, useState } from "react";
import api from "../../services/api";

/** Autocomplete da base CNPJ (RFB). Dropdown de <button> — nunca aninhar
 *  input em button (lição do MunicipioPicker: espaço dispara click sintético). */
export default function BuscaEmpresaRfb({ onSelect, disabled }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResultados(null); return undefined; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get("/empresas/buscar", { params: { q: q.trim() } });
        setResultados(res.data || []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="relative">
      <input
        aria-label="Buscar empresa na base CNPJ"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome ou CNPJ…"
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {buscando && <p className="text-[11px] text-slate-400 mt-1">Buscando…</p>}
      {resultados && !buscando && (
        resultados.length === 0 ? (
          <p className="text-[11px] text-slate-400 mt-1">Nenhuma empresa encontrada.</p>
        ) : (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-xl overflow-hidden">
            {resultados.map((e) => (
              <button
                key={e.cnpj_basico}
                type="button"
                onClick={() => { onSelect(e); setQ(""); setResultados(null); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--panel-2)] cursor-pointer"
              >
                <span className="font-medium">{e.razao_social}</span>
                <span className="text-slate-400"> · {e.cnpj_basico}</span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
