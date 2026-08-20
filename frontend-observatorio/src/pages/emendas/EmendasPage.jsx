import { useEffect, useState, useMemo } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
import { NidPanel } from "../../components/nid/Panel";
import { fmtMoneyShort, fmtMoneyFull, HBarChart } from "../../components/nid/charts";
import BarraExecucao from "../../components/nid/BarraExecucao";
import DataTable from "../../components/nid/DataTable";
import { emendaParaCaptacaoPayload } from "../../utils/emendaCaptacao";
import NidSelect from "../../components/nid/NidSelect";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";

const tipoCurto = (t) => (t || "").split(" - ")[0];

export default function EmendasPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [radar, setRadar] = useState(null);
  const [ano, setAno] = useState("");           // "" = todos os anos
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    setLoading(true);
    api.get("/emendas/radar", { params: ano ? { ano } : {} })
      .then((r) => setRadar(r.data))
      .catch((err) => console.error("Erro ao carregar radar de emendas:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio, ano]);

  const porAutorRankeado = useMemo(
    () => (radar?.por_autor || []).map((a, i) => ({ ...a, rank: i + 1 })),
    [radar]
  );

  if (needsMunicipio) {
    return <SelecioneMunicipio />;
  }

  if (loading && !radar) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    );
  }

  const k = radar?.kpis;
  const indisponivel = !radar?.disponivel;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-dim)]">
        <span>Quem envia recurso, quanto e o que já foi executado</span>
        <InfoTooltip dataset="emendas" />
        {(radar?.anos || []).length > 0 && (
          <NidSelect value={ano} onChange={(e) => setAno(e.target.value)} ariaLabel="Filtrar por ano" className="ml-auto">
            <option value="">Todos os anos</option>
            {radar.anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </NidSelect>
        )}
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Sem emendas carregadas</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            Execute a fonte automática "Emendas Parlamentares (Portal da Transparência)" em Administração → Fontes de Dados.
            Emendas com localidade "Nacional" ou estadual não são municipalizáveis — o total aqui é um piso.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Total destinado (empenhado)" value={fmtMoneyShort(k.total_empenhado)} sub={`${k.num_emendas} emenda(s)`} dataset="emendas" indicadorKey="total_empenhado" />
            <KpiCard label="Executado (pago)" value={fmtMoneyShort(k.pago_total)} sub={k.pct_pago != null ? `${Number(k.pct_pago).toLocaleString("pt-BR")}% do empenhado` : "—"} dataset="emendas" indicadorKey="pago_total" />
            <KpiCard label="Parlamentares" value={String(k.num_parlamentares)} sub="autores com emendas destinadas" dataset="emendas" indicadorKey="num_parlamentares" />
            <KpiCard label="Maior padrinho" value={k.top_autor || "—"} sub={k.top_autor_valor != null ? fmtMoneyShort(k.top_autor_valor) : ""} dataset="emendas" indicadorKey="top_autor" />
          </div>

          <NidPanel title="Ranking por parlamentar" dataset="emendas" indicadorKey="chart_ranking_parlamentar" sub="Total destinado e execução — quem manda (e quem não manda) recurso">
            <DataTable
              columns={[
                { key: "rank", label: "#", width: 50, sortable: false, render: (a) => <span className="muted">{a.rank}º</span> },
                { key: "autor", label: "Parlamentar" },
                { key: "num_emendas", label: "Emendas", align: "right", mono: true },
                { key: "empenhado", label: "Destinado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "pago_total", label: "Pago (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "pct_pago", label: "Execução", width: 170, render: (a) => <BarraExecucao pct={a.pct_pago} /> },
              ]}
              data={porAutorRankeado}
              pageSize={12}
              emptyMessage="Sem emendas no período."
            />
          </NidPanel>

          <NidPanel title="Destino por área" dataset="emendas" indicadorKey="chart_destino_area" sub="Total empenhado por função orçamentária">
            <HBarChart
              data={radar.por_funcao.map((f) => ({ label: f.funcao, value: f.empenhado }))}
              color="var(--accent-3)"
              fmt={fmtMoneyShort}
              emptyMessage="Sem detalhamento por função."
            />
          </NidPanel>

          <NidPanel title="Emendas destinadas ao município" dataset="emendas" indicadorKey="chart_funil_execucao" sub="Funil de execução: empenhado → liquidado → pago (inclui restos a pagar pagos)">
            <DataTable
              columns={[
                { key: "ano", label: "Ano", width: 70 },
                { key: "autor", label: "Autor" },
                { key: "tipo", label: "Tipo", render: (e) => <span className="muted" title={e.tipo}>{tipoCurto(e.tipo)}</span> },
                { key: "funcao", label: "Área" },
                { key: "empenhado", label: "Empenhado (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "pago_total", label: "Pago (R$)", align: "right", mono: true, fmt: fmtMoneyFull },
                { key: "pct_pago", label: "Execução", width: 170, render: (e) => <BarraExecucao pct={e.pct_pago} /> },
                {
                  key: "acoes", label: "", sortable: false, align: "right", ariaLabel: "Ações",
                  render: (e) => (
                    <CriarOportunidadeCaptacao
                      compact
                      label="Criar oportunidade no funil a partir desta emenda"
                      payload={emendaParaCaptacaoPayload(e)}
                    />
                  ),
                },
              ]}
              data={radar.emendas}
              pageSize={12}
              emptyMessage="Sem emendas no período."
            />
          </NidPanel>
        </>
      )}
    </div>
  );
}
