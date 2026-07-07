import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import {
  AreaLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
  fmtNumberShort,
  fmtNumber,
} from "../../components/nid/charts";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtHab = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
const fmtCoef = (c) => (c == null ? "—" : Number(c).toLocaleString("pt-BR", { minimumFractionDigits: 1 }));
const fmtMi = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

// ── Hero do alerta ───────────────────────────────────────────────────────────
function HeroAlerta({ a }) {
  const tons = {
    oportunidade: { cor: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", titulo: "Oportunidade de subir de faixa" },
    risco: { cor: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", titulo: "Risco de cair de faixa" },
    estavel: { cor: "var(--border)", bg: "var(--panel)", titulo: "Faixa estável" },
    teto: { cor: "var(--border)", bg: "var(--panel)", titulo: "Coeficiente máximo (4,0)" },
  };
  const t = tons[a.status] || tons.estavel;
  return (
    <div className="rounded-2xl p-6 border" style={{ borderColor: t.cor, background: t.bg }}>
      <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">{t.titulo}</p>
      <p className="text-lg md:text-2xl font-bold mt-2 text-[var(--text)] leading-snug">
        {a.status === "oportunidade" && (
          <>Faltam {fmtHab(a.hab_para_subir)} habitantes para o próximo coeficiente
            {a.ganho_proxima_faixa != null && <> — vale ~{fmtMi(a.ganho_proxima_faixa)}/ano a mais</>}.</>
        )}
        {a.status === "risco" && (
          <>Sua cidade está a {fmtHab(a.hab_para_cair)} habitantes de cair de faixa
            {a.perda_faixa_anterior != null && <> — ~{fmtMi(a.perda_faixa_anterior)}/ano em risco</>}.</>
        )}
        {a.status === "teto" && <>O município já está na faixa máxima do FPM-Interior.</>}
        {a.status === "estavel" && (
          <>Próximo coeficiente a {fmtHab(a.hab_para_subir)} habitantes
            {a.ganho_proxima_faixa != null && <> (~{fmtMi(a.ganho_proxima_faixa)}/ano a mais)</>}.</>
        )}
      </p>
      <p className="text-sm mt-2 text-[var(--text-dim)]">
        Estimativa IBGE {a.ano_populacao}: {fmtHab(a.populacao)} habitantes · coeficiente estimado {fmtCoef(a.coeficiente)}.
        {a.divergencia && <> <b>Atenção:</b> valores estimados — o coeficiente oficial (TCU) pode diferir por trava legal.</>}
        {a.fpm_12m_parcial && <> FPM anualizado a partir de menos de 12 meses de dados.</>}
        {" "}Valores de repasse brutos (antes de retenções como FUNDEB).
      </p>
    </div>
  );
}

// ── Régua de faixas ──────────────────────────────────────────────────────────
function ReguaFaixas({ faixas, populacao }) {
  const idx = faixas.findIndex((f) => f.atual);
  if (idx < 0) return null;
  const vizinhas = faixas.slice(Math.max(0, idx - 1), Math.min(faixas.length, idx + 2));
  return (
    <div className="flex items-stretch gap-1.5">
      {vizinhas.map((f) => {
        const atual = f.atual;
        const pct = atual && f.pop_max != null
          ? Math.min(100, Math.max(0, ((populacao - f.pop_min) / (f.pop_max - f.pop_min)) * 100))
          : null;
        return (
          <div
            key={f.coeficiente}
            className={`rounded-xl border p-3 ${atual ? "flex-[2]" : "flex-1 opacity-70"}`}
            style={{ borderColor: atual ? "var(--accent-1)" : "var(--border)", background: "var(--panel)" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-[var(--text)]">coef. {fmtCoef(f.coeficiente)}</span>
              {atual && <span className="text-xs font-semibold text-[var(--accent-1)]">sua faixa</span>}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              {fmtHab(f.pop_min)} – {f.pop_max != null ? fmtHab(f.pop_max) : "∞"} hab.
            </p>
            {atual && pct != null && (
              <div className="mt-2 h-2 rounded-full bg-[var(--panel-2)] relative overflow-hidden" aria-hidden>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "var(--accent-1)" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function FpmPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [alerta, setAlerta] = useState(null);
  const [serie, setSerie] = useState({ mensal: [], anual: [], populacao: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    Promise.all([api.get("/fpm/alerta"), api.get("/fpm/serie")])
      .then(([a, s]) => {
        setAlerta(a.data);
        setSerie(s.data || { mensal: [], anual: [], populacao: [] });
      })
      .catch((err) => console.error("Erro ao carregar FPM:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio]);

  // últimos 36 meses para o gráfico mensal
  const mensalChart = useMemo(
    () => serie.mensal.slice(-36).map((d) => ({
      label: `${MESES[d.mes - 1]}/${String(d.ano).slice(2)}`,
      value: d.valor,
    })),
    [serie.mensal]
  );

  const populacaoChart = useMemo(
    () => serie.populacao.map((d) => ({ label: String(d.ano), value: d.populacao })),
    [serie.populacao]
  );

  const proximaFaixa = useMemo(() => {
    const faixas = alerta?.faixas || [];
    const idx = faixas.findIndex((f) => f.atual);
    return idx >= 0 && idx + 1 < faixas.length ? faixas[idx + 1] : null;
  }, [alerta]);

  const anualDesc = useMemo(() => [...serie.anual].reverse(), [serie.anual]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="FPM" sub="Fundo de Participação dos Municípios" />
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">Use <b>"Ver como"</b> na administração de Municípios.</p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const indisponivel = !alerta?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader title="FPM" sub="Fundo de Participação dos Municípios — faixa populacional e repasses" />
        <InfoTooltip dataset="fpm" />
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">
            {alerta?.nao_aplicavel ? "Não se aplica" : "Sem dados de população"}
          </p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            {alerta?.motivo === "fpm_capitais" && "Capitais seguem o regime FPM-Capitais, fora das faixas do FPM-Interior."}
            {alerta?.motivo === "sem_codigo_ibge" && "Cadastre o código IBGE do município na administração."}
            {alerta?.motivo === "sem_populacao" && "Execute a fonte automática \"População (IBGE)\" em Administração → Fontes de Dados."}
          </p>
        </div>
      ) : (
        <>
          <HeroAlerta a={alerta} />
          <ReguaFaixas faixas={alerta.faixas} populacao={alerta.populacao} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="FPM últimos 12 meses" value={alerta.fpm_12m != null ? fmtMoneyShort(alerta.fpm_12m) : "—"} sub={alerta.fpm_12m_parcial ? "anualizado (dados parciais)" : "repasse bruto"} dataset="fpm" indicadorKey="fpm_12m" />
            <KpiCard label="Coeficiente estimado" value={fmtCoef(alerta.coeficiente)} sub={alerta.divergencia ? "oficial pode diferir (trava)" : "pela população"} dataset="fpm" indicadorKey="coeficiente" />
            <KpiCard label="Valor por ponto de coeficiente" value={alerta.valor_por_ponto != null ? fmtMoneyShort(alerta.valor_por_ponto) : "—"} sub="R$/ano por 1,0 de coeficiente" dataset="fpm" indicadorKey="valor_por_ponto" />
            <KpiCard label="População" period={alerta.ano_populacao ? String(alerta.ano_populacao) : undefined} value={fmtHab(alerta.populacao)} sub={alerta.fonte_populacao || ""} dataset="fpm" indicadorKey="populacao" />
          </div>

          <NidPanel title="Repasses mensais do FPM" sub="Últimos 36 meses · valores brutos">
            <AreaLineChart
              data={mensalChart}
              height={280}
              label="FPM"
              color="var(--accent-1)"
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
              emptyMessage='Sem repasses carregados — execute a fonte "FPM — repasses (STN)" em Administração → Fontes de Dados.'
            />
          </NidPanel>

          <NidPanel title="População estimada por ano" sub="Estimativas do IBGE · limite da próxima faixa marcado">
            <AreaLineChart
              data={populacaoChart}
              height={260}
              label="População"
              color="var(--accent-3)"
              yFmt={fmtNumberShort}
              tipFmt={fmtNumber}
              benchmark={proximaFaixa ? { value: proximaFaixa.pop_min, label: `próxima faixa (coef. ${fmtCoef(proximaFaixa.coeficiente)})` } : undefined}
              emptyMessage="Sem série de população carregada."
            />
          </NidPanel>

          <NidPanel title="Total anual" sub="Soma dos repasses por ano">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Ano</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Total (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Meses com dado</th>
                  </tr>
                </thead>
                <tbody>
                  {anualDesc.map((a) => (
                    <tr key={a.ano} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{a.ano}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(a.valor_total)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{a.meses}</td>
                    </tr>
                  ))}
                  {anualDesc.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--text-dim)]">Sem dados de repasse.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
