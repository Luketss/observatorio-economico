import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { resumoProjetos } from "../utils/projetosResumo";
import { NidPanel } from "./nid/Panel";

/** Resumo de Projetos para o modo gerencial: contadores + os 3 em andamento
 *  que mais precisam de atenção (atraso primeiro). Fetch próprio.
 *
 *  `dataset`/`indicadorKey` são opcionais: só o Painel do Prefeito passa os
 *  valores (ⓘ ao lado do título); se o card for reutilizado em outra tela
 *  sem essas props, o ⓘ não aparece. */
export default function ProjetosResumoCard({ dataset, indicadorKey } = {}) {
  const [projetos, setProjetos] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get("/projetos")
      .then((r) => setProjetos(r.data || []))
      .catch(() => setProjetos([]))
      .finally(() => setCarregando(false));
  }, []);

  const r = resumoProjetos(projetos || []);

  return (
    <NidPanel
      title="Projetos"
      sub="Ações em execução no município"
      dataset={dataset}
      indicadorKey={indicadorKey}
      right={
        <Link to="/app/projetos" className="nid-pill nid-pill--inner" aria-label="Ver projetos">
          Ver projetos →
        </Link>
      }
    >
      {carregando ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Carregando…</div>
      ) : r.total === 0 ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Nenhum projeto cadastrado ainda.</div>
      ) : (
        <div className="space-y-3 py-1">
          <div className="flex gap-4 flex-wrap text-sm">
            <span className="text-[var(--text)]"><b>{r.em_andamento}</b> em andamento</span>
            <span className="text-[var(--text)]"><b>{r.concluidos}</b> concluídos</span>
            <span style={{ color: r.atrasados ? "var(--accent-2)" : "var(--text-dim)" }}>
              <b>{r.atrasados}</b> atrasado{r.atrasados === 1 ? "" : "s"}
            </span>
          </div>
          {r.top.length > 0 && (
            <ul className="space-y-2">
              {r.top.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--text)]">{p.titulo}</span>
                  <span className="shrink-0 text-xs text-[var(--text-dim)]">
                    {p.pct}%{p.diasAtraso != null ? ` · ${p.diasAtraso}d atrasado` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </NidPanel>
  );
}
