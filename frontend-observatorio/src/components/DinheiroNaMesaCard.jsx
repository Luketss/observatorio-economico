import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BanknotesIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import ChartInfoIcon from "./ChartInfoIcon";

const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

/** Teaser livre do Dinheiro na Mesa (decisão de produto: card livre, página
 * gateada). Autossuficiente: fetch próprio, null sem dados.
 *
 * `dataset`/`indicadorKey` são opcionais: só o Painel do Prefeito passa os
 * valores (ⓘ ao lado do título); se o card for reutilizado em outra tela
 * sem essas props, o ⓘ não aparece. */
export default function DinheiroNaMesaCard({ dataset, indicadorKey } = {}) {
  const [resumo, setResumo] = useState(null);
  const comInfo = Boolean(dataset && indicadorKey);

  useEffect(() => {
    api.get("/captacao-federal/resumo").then((r) => setResumo(r.data)).catch(() => setResumo(null));
  }, []);

  if (!resumo?.disponivel || resumo.media_pares == null) return null;
  const abaixo = !resumo.acima_da_media;
  const tom = abaixo
    ? { border: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", Icon: BanknotesIcon, iconCls: "text-amber-500" }
    : { border: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", Icon: ArrowTrendingUpIcon, iconCls: "text-emerald-500" };
  const { Icon } = tom;

  return (
    <Link to="/app/dinheiro-na-mesa" className="block" aria-label="Ver diagnóstico de captação">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 md:p-5 border transition-shadow hover:shadow-md"
        style={{ borderColor: tom.border, background: tom.bg }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex-shrink-0">
            <Icon className={`w-5 h-5 ${tom.iconCls}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)] flex items-center gap-1.5">
              Dinheiro na mesa — captação federal
              {comInfo && (
                <span onClick={(e) => e.stopPropagation()}>
                  <ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />
                </span>
              )}
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              {abaixo ? (
                <>Municípios pares captaram em média <b>{fmtMi(resumo.media_pares)}</b> em {resumo.ano_referencia}; você captou <b>{fmtMi(resumo.voce_firmado)}</b> — <b>{fmtMi(resumo.dinheiro_na_mesa)}</b> na mesa.</>
              ) : (
                <>Você captou <b>{fmtMi(resumo.voce_firmado)}</b> em {resumo.ano_referencia} — acima da média dos pares (<b>{fmtMi(resumo.media_pares)}</b>).</>
              )}
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Convênios federais (SICONV) · grupo de {resumo.total_grupo} municípios do mesmo porte na sua UF
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
