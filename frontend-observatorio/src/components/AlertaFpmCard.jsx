import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ScaleIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fmtHab = (n) => Number(n).toLocaleString("pt-BR");
const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

const TONS = {
  oportunidade: { border: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", Icon: ArrowTrendingUpIcon, iconCls: "text-emerald-500" },
  risco: { border: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", Icon: ArrowTrendingDownIcon, iconCls: "text-amber-500" },
  estavel: { border: "var(--border)", bg: "var(--panel)", Icon: ScaleIcon, iconCls: "text-[var(--text-mute)]" },
  teto: { border: "var(--border)", bg: "var(--panel)", Icon: ScaleIcon, iconCls: "text-[var(--text-mute)]" },
};

/** Frase-título do alerta conforme o status. */
function fraseAlerta(a) {
  if (a.status === "oportunidade") {
    return (
      <>Faltam <b>{fmtHab(a.hab_para_subir)} habitantes</b> para o próximo coeficiente do FPM
        {a.ganho_proxima_faixa != null && <> — vale <b>~{fmtMi(a.ganho_proxima_faixa)}/ano</b> a mais</>}.</>
    );
  }
  if (a.status === "risco") {
    return (
      <>Sua cidade está a <b>{fmtHab(a.hab_para_cair)} habitantes</b> de cair de faixa do FPM
        {a.perda_faixa_anterior != null && <> — <b>~{fmtMi(a.perda_faixa_anterior)}/ano</b> em risco</>}.</>
    );
  }
  if (a.status === "teto") {
    return <>Coeficiente máximo do FPM (<b>4,0</b>) — {a.hab_para_cair != null ? <>margem de {fmtHab(a.hab_para_cair)} habitantes acima do piso da faixa</> : "situação estável"}.</>;
  }
  return (
    <>Faixa estável no FPM (coeficiente <b>{Number(a.coeficiente).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</b>)
      {a.hab_para_subir != null && <> — próximo coeficiente a {fmtHab(a.hab_para_subir)} habitantes</>}.</>
  );
}

export default function AlertaFpmCard() {
  const [alerta, setAlerta] = useState(null);

  useEffect(() => {
    api.get("/fpm/alerta").then((r) => setAlerta(r.data)).catch(() => setAlerta(null));
  }, []);

  if (!alerta?.disponivel) return null;
  const tom = TONS[alerta.status] || TONS.estavel;
  const { Icon } = tom;

  return (
    <Link to="/app/fpm" className="block" aria-label="Ver detalhes do FPM">
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
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">
              Alerta de faixa do FPM
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              {fraseAlerta(alerta)}
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Estimativa IBGE {alerta.ano_populacao} · {fmtHab(alerta.populacao)} hab. · coeficiente estimado{" "}
              {Number(alerta.coeficiente).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
              {alerta.divergencia && " · valores estimados — o repasse real pode diferir do estimado (trava legal ou Reserva do FPM)"}
              {alerta.fpm_12m_parcial && " · FPM anualizado (menos de 12 meses de dados)"}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
