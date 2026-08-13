import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import DataTable from "../../components/nid/DataTable";
import { MultiLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";

const fmtMi = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};
const fmtHab = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));

// ── Hero do diagnóstico ──────────────────────────────────────────────────────
function HeroDiagnostico({ d }) {
  const abaixo = !d.acima_da_media && d.media_pares != null;
  const tom = abaixo
    ? { cor: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", titulo: "Dinheiro na mesa" }
    : { cor: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", titulo: "Acima da média dos pares" };
  return (
    <div className="rounded-2xl p-6 border" style={{ borderColor: tom.cor, background: tom.bg }}>
      <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">{tom.titulo}</p>
      <p className="text-lg md:text-2xl font-bold mt-2 text-[var(--text)] leading-snug">
        {d.media_pares == null ? (
          <>Sem municípios pares com dados na sua UF para comparar ({d.ano_referencia}).</>
        ) : (
          <>Municípios pares captaram em média {fmtMi(d.media_pares)} em {d.ano_referencia}; você captou {fmtMi(d.voce_firmado)}
            {abaixo && <> — <span className="whitespace-nowrap">{fmtMi(d.dinheiro_na_mesa)} na mesa</span></>}.</>
        )}
      </p>
      <p className="text-sm mt-2 text-[var(--text-dim)]">
        Pares = municípios da mesma faixa populacional do FPM na {d.uf}
        {d.faixa_pop_min != null && <> ({fmtHab(d.faixa_pop_min)}–{d.faixa_pop_max != null ? fmtHab(d.faixa_pop_max) : "∞"} hab.)</>}
        {" "}· grupo de {d.total_grupo} municípios{d.pares_com_dados != null && d.pares_com_dados < d.total_grupo - 1 ? ` (${d.pares_com_dados} pares com dados)` : ""} · convênios e transferências da União (SICONV), repasse federal firmado no ano.
        {d.media_nacional != null && <> Média nacional da faixa: {fmtMi(d.media_nacional)}.</>}
      </p>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function DinheiroNaMesaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    api.get("/captacao-federal/diagnostico")
      .then((r) => setDiag(r.data))
      .catch((err) => console.error("Erro ao carregar diagnóstico de captação:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio]);

  const serieChart = useMemo(() => (diag?.serie || []).map((i) => ({
    label: i.parcial ? `${i.ano}*` : String(i.ano),
    "Você": i.voce,
    "Média dos pares": i.media_pares ?? 0,
  })), [diag]);

  const serieDesc = useMemo(() => [...(diag?.serie || [])].reverse(), [diag]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Dinheiro na Mesa" sub="Captação federal vs. municípios pares" />
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    );
  }

  const indisponivel = !diag?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader title="Dinheiro na Mesa" sub="Captação de convênios federais vs. municípios do mesmo porte" />
        <InfoTooltip dataset="captacao_federal" />
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">
            {diag?.nao_aplicavel ? "Não se aplica" : "Sem dados de captação"}
          </p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            {diag?.motivo === "capital" && "A comparação usa as faixas do FPM-Interior; capitais ficam fora do grupo de pares."}
            {diag?.motivo === "sem_codigo_ibge" && "Cadastre o código IBGE do município na administração."}
            {diag?.motivo === "sem_populacao" && "Execute a fonte automática \"População (IBGE)\" em Administração → Fontes de Dados."}
            {diag?.motivo === "sem_dados" && "Execute a fonte automática \"Captação Federal — convênios (SICONV)\" em Administração → Fontes de Dados (UF inteira)."}
            {!["capital", "sem_codigo_ibge", "sem_populacao", "sem_dados"].includes(diag?.motivo) &&
              "Dados indisponíveis para este município."}
          </p>
        </div>
      ) : (
        <>
          <HeroDiagnostico d={diag} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={`Captação firmada (${diag.ano_referencia})`} value={fmtMoneyShort(diag.voce_firmado)} sub={`${diag.qtd_convenios ?? 0} convênio(s)`} dataset="captacao_federal" indicadorKey="voce_firmado" />
            <KpiCard label="Via emenda parlamentar" value={fmtMoneyShort(diag.via_emenda)} sub="parte do firmado" dataset="captacao_federal" indicadorKey="via_emenda" />
            <KpiCard label={`Desembolsado (${diag.ano_referencia})`} value={fmtMoneyShort(diag.desembolsado)} sub="dinheiro que entrou no ano" dataset="captacao_federal" indicadorKey="desembolsado" />
            <KpiCard label="Posição no grupo" value={diag.posicao != null ? `${diag.posicao}º` : "—"} sub={`de ${diag.total_grupo} municípios pares`} dataset="captacao_federal" indicadorKey="posicao" />
          </div>

          <NidPanel title="Captação anual — você vs. média dos pares" dataset="captacao_federal" indicadorKey="chart_captacao_anual" sub="Repasse federal firmado por ano · * ano corrente (parcial)">
            <MultiLineChart
              data={serieChart}
              series={["Você", "Média dos pares"]}
              colors={["var(--accent-1)", "var(--accent-3)"]}
              height={280}
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
              legend
              emptyMessage='Sem dados — execute a fonte "Captação Federal" em Administração → Fontes de Dados.'
            />
          </NidPanel>

          <NidPanel title="Detalhe anual" dataset="captacao_federal" indicadorKey="chart_detalhe_anual" sub="Valores firmados, via emenda e desembolsados">
            <DataTable
              columns={[
                { key: "ano", label: "Ano", width: 80, render: (i) => `${i.ano}${i.parcial ? "*" : ""}` },
                { key: "voce", label: "Você (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "media_pares", label: "Média pares (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "via_emenda", label: "Via emenda (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "desembolsado", label: "Desembolsado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "qtd_convenios", label: "Convênios", align: "right", mono: true },
              ]}
              data={serieDesc}
              emptyMessage="Sem dados de captação."
            />
          </NidPanel>

          <div className="flex justify-end">
            <CriarOportunidadeCaptacao
              payload={{
                tipo: "convenio",
                titulo: "Nova oportunidade de convênio federal",
                entidade_origem: "Transferegov / SICONV",
                valor_estimado: diag.dinheiro_na_mesa > 0 ? diag.dinheiro_na_mesa : null,
                descricao: `Diagnóstico Dinheiro na Mesa (${diag.ano_referencia}): média dos pares ${diag.media_pares != null ? fmtMi(diag.media_pares) : "—"}, captado ${fmtMi(diag.voce_firmado)}.`,
              }}
            />
          </div>
        </>
      )}
    </motion.div>
  );
}
