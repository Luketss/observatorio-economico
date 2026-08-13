import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { NidPanel } from "./nid/Panel";

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Resumo do Funil de Investimentos para o modo gerencial do Painel do
 *  Prefeito. Fetch próprio; funil vazio ou erro viram estado vazio discreto
 *  (o card não some — o prefeito deve saber que o funil existe). */
export default function FunilResumoCard() {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get("/desenvolvimento-economico/funil/resumo")
      .then((r) => setResumo(r.data))
      .catch(() => setResumo(null))
      .finally(() => setCarregando(false));
  }, []);

  const totalLeads = Object.values(resumo?.por_estagio || {}).reduce((s, n) => s + (n || 0), 0);

  return (
    <NidPanel
      title="Funil de Investimentos"
      sub="Oportunidades em captação"
      right={
        <Link to="/app/desenvolvimento-economico/funil" className="nid-pill nid-pill--inner" aria-label="Ver funil">
          Ver funil →
        </Link>
      }
    >
      {carregando ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Carregando…</div>
      ) : totalLeads === 0 ? (
        <div className="text-sm text-[var(--text-dim)] py-3">
          Nenhuma oportunidade no funil ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-1">
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{totalLeads}</div>
            <div className="text-xs text-[var(--text-dim)]">Oportunidades</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{fmtBRL(resumo.valor_total_estimado)}</div>
            <div className="text-xs text-[var(--text-dim)]">Valor potencial</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{`${resumo.taxa_conversao ?? 0}%`}</div>
            <div className="text-xs text-[var(--text-dim)]">Taxa de conversão</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{resumo.por_estagio?.implantacao || 0}</div>
            <div className="text-xs text-[var(--text-dim)]">Em implantação</div>
          </div>
        </div>
      )}
    </NidPanel>
  );
}
