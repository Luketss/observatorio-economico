import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import KpiCard from "../../components/KpiCard";
import NidSelect from "../../components/nid/NidSelect";
import { NidPanel, NidInsight } from "../../components/nid/Panel";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";
import {
  MultiLineChart,
  fmtMoneyShort,
  fmtMoneyFull,
  fmtUsdShort,
  fmtUsdFull,
  fmtNumber,
  fmtNumberShort,
} from "../../components/nid/charts";
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import { montarLeitura } from "../../utils/leituraBenchmark";

const VAZIO = {
  indicador: null, foco: null, pares: [], fixados: [],
  criterio_pares: null, motivo: null, posicao: null, itens: [],
};

const fmtIndice = (v) => Number(v).toFixed(4);
// COMEX é USD — formatar como R$ replicaria o erro da tela de ranking antiga.
const FMT = {
  brl: { eixo: fmtMoneyShort, tip: fmtMoneyFull },
  usd: { eixo: fmtUsdShort, tip: fmtUsdFull },
  numero: { eixo: fmtNumberShort, tip: fmtNumber },
  indice: { eixo: fmtIndice, tip: fmtIndice },
};

// Paleta dos fixados — mesma regra do PIB/VAF: fora de --accent-2 (foco) e
// --accent-1 (hover de par), senão o fixado se confunde com os dois.
const CORES_FIXADOS = ["var(--accent-4)", "var(--accent-5)", "var(--accent-3)"];

export default function ComparacaoPares() {
  const [indicadores, setIndicadores] = useState([]);
  const [indicador, setIndicador] = useState("pib");
  const [fixadosIds, setFixadosIds] = useState([]);
  const [data, setData] = useState(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/benchmark/indicadores")
      .then((r) => setIndicadores(r.data || []))
      .catch(() => setIndicadores([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get("/benchmark/comparativo", {
      params: {
        indicador,
        ...(fixadosIds.length ? { fixados: fixadosIds.join(",") } : {}),
      },
    })
      .then((r) => setData(r.data || VAZIO))
      .catch(() => setData(VAZIO))
      .finally(() => setLoading(false));
  }, [indicador, fixadosIds]);

  const cmp = useMemo(
    () => montarComparativo({
      itens: data.itens, foco: data.foco, pares: data.pares, fixados: data.fixados,
      anoKey: "ano", valorKey: "valor",
    }),
    [data]
  );
  const series = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
  const cores = useMemo(
    () => series.map((s) => {
      const iFix = cmp.pinnedSeries.indexOf(s);
      return iFix >= 0 ? CORES_FIXADOS[iFix % CORES_FIXADOS.length] : "var(--accent-1)";
    }),
    [series, cmp.pinnedSeries]
  );

  const fmt = FMT[data.indicador?.unidade] || FMT.numero;
  const leituras = useMemo(
    () => montarLeitura({ posicao: data.posicao, itens: data.itens, foco: data.foco, pares: data.pares }),
    [data]
  );
  const pos = data.posicao;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-dim)]">Indicador:</span>
        <NidSelect
          value={indicador}
          onChange={(e) => setIndicador(e.target.value)}
          ariaLabel="Escolher indicador"
        >
          {indicadores.map((i) => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </NidSelect>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          label="Posição no Brasil"
          period={pos ? String(pos.ano) : undefined}
          value={pos ? `#${pos.nacional.rank} de ${pos.nacional.total}` : "—"}
        />
        <KpiCard
          label={`Posição em ${data.foco?.estado ?? "sua UF"}`}
          period={pos ? String(pos.ano) : undefined}
          value={pos ? `#${pos.estadual.rank} de ${pos.estadual.total}` : "—"}
        />
      </div>

      {(cmp.focusSeries || data.motivo) && (
        <NidPanel
          title={`Evolução — ${data.indicador?.label ?? ""}`}
          sub={descreverPares(data)}
        >
          <ComparadorMunicipios fixados={data.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={series}
            colors={cores}
            height={280}
            yFmt={fmt.eixo}
            tipFmt={fmt.tip}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}

      {!loading && leituras.length > 0 && (
        <div className="nid-insights">
          {leituras.map((l) => (
            <NidInsight key={l.texto} kind={l.kind}>{l.texto}</NidInsight>
          ))}
        </div>
      )}
    </div>
  );
}
