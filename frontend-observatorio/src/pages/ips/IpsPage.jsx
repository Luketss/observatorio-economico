import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import KpiCard from "../../components/KpiCard";
import InfoTooltip from "../../components/InfoTooltip";
import { NidPageHeader, NidPanel } from "../../components/nid/Panel";
import { HBarChart, MultiLineChart } from "../../components/nid/charts";
import BarraExecucao from "../../components/nid/BarraExecucao";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import NidSelect from "../../components/nid/NidSelect";
import KpiSkeleton from "../../components/nid/KpiSkeleton";

function fmt(v) {
  if (v == null) return "—";
  return Number(v).toFixed(1);
}

// Convenção nid: positivo → accent-5, atenção → accent-4, crítico → accent-2.
function scoreAccent(score) {
  if (score == null) return undefined;
  if (score >= 70) return "var(--accent-5)";
  if (score >= 50) return "var(--accent-4)";
  return "var(--accent-2)";
}

const DIMENSIONS = [
  { key: "necessidades_humanas_basicas", label: "Necessidades Humanas Básicas", short: "NHB" },
  { key: "fundamentos_bem_estar", label: "Fundamentos do Bem-estar", short: "FBE" },
  { key: "oportunidades", label: "Oportunidades", short: "OPO" },
];

const COMPONENTS = [
  { key: "nutricao_cuidados_medicos", label: "Nutrição e Cuidados Médicos", dim: "nhb" },
  { key: "agua_saneamento", label: "Água e Saneamento", dim: "nhb" },
  { key: "moradia", label: "Moradia", dim: "nhb" },
  { key: "seguranca_pessoal", label: "Segurança Pessoal", dim: "nhb" },
  { key: "acesso_conhecimento_basico", label: "Acesso ao Conhecimento", dim: "fbe" },
  { key: "acesso_informacao_comunicacao", label: "Acesso à Informação", dim: "fbe" },
  { key: "saude_bem_estar", label: "Saúde e Bem-estar", dim: "fbe" },
  { key: "qualidade_meio_ambiente", label: "Meio Ambiente", dim: "fbe" },
  { key: "direitos_individuais", label: "Direitos Individuais", dim: "opo" },
  { key: "liberdades_individuais", label: "Liberdades Individuais", dim: "opo" },
  { key: "inclusao_social", label: "Inclusão Social", dim: "opo" },
  { key: "acesso_educacao_superior", label: "Educação Superior", dim: "opo" },
];

const SUB_INDICATORS = [
  { key: "cobertura_vacinal_poliomielite", label: "Cobertura Vacinal", dim: "nhb" },
  { key: "mortalidade_infantil_5_anos", label: "Mortalidade Infantil (<5a)", dim: "nhb" },
  { key: "abastecimento_agua_rede", label: "Abastecimento de Água", dim: "nhb" },
  { key: "esgotamento_sanitario_adequado", label: "Esgotamento Sanitário", dim: "nhb" },
  { key: "domicilios_coleta_residuos", label: "Coleta de Resíduos", dim: "nhb" },
  { key: "assassinatos_jovens", label: "Assassinatos de Jovens", dim: "nhb" },
  { key: "homicidios", label: "Homicídios", dim: "nhb" },
  { key: "abandono_ensino_medio", label: "Abandono Ens. Médio", dim: "fbe" },
  { key: "ideb_ensino_fundamental", label: "Ideb Ens. Fundamental", dim: "fbe" },
  { key: "cobertura_internet_movel", label: "Internet Móvel (4G/5G)", dim: "fbe" },
  { key: "expectativa_vida", label: "Expectativa de Vida", dim: "fbe" },
  { key: "obesidade", label: "Obesidade", dim: "fbe" },
  { key: "areas_verdes_urbanas", label: "Áreas Verdes Urbanas", dim: "fbe" },
  { key: "emissoes_co2_habitante", label: "Emissões CO₂/hab", dim: "fbe" },
  { key: "acesso_cultura_lazer_esporte", label: "Cultura, Lazer e Esporte", dim: "opo" },
  { key: "gravidez_adolescencia", label: "Gravidez na Adolescência", dim: "opo" },
  { key: "paridade_genero_camara", label: "Paridade de Gênero (Câmara)", dim: "opo" },
  { key: "empregados_ensino_superior", label: "Empregados c/ Ens. Superior", dim: "opo" },
  { key: "nota_mediana_enem", label: "Nota Mediana ENEM", dim: "opo" },
];

const SERIES_COLORS = [
  "var(--accent-1)", "var(--accent-5)", "var(--accent-4)",
  "var(--accent-2)", "var(--accent-3)", "var(--accent-7)",
];

export default function IpsPage() {
  const { user } = useAuth();

  const [estados, setEstados] = useState([]);
  const [selectedEstado, setSelectedEstado] = useState("");
  const [municipios, setMunicipios] = useState([]);
  const [selectedMunicipioId, setSelectedMunicipioId] = useState(null);
  const [selectedAno, setSelectedAno] = useState(2025);

  const [scorecard, setScorecard] = useState(null);
  const [evolucao, setEvolucao] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [comparativo, setComparativo] = useState([]);
  const [destaques, setDestaques] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compareMunicipioIds, setCompareMunicipioIds] = useState([]);
  const [openDims, setOpenDims] = useState({ nhb: false, fbe: false, opo: false });

  // Load state list on mount
  useEffect(() => {
    api.get("/ips/municipios", { params: { ano: selectedAno } }).then((res) => {
      const estadoSet = [...new Set(res.data.map((m) => m.estado))].sort();
      setEstados(estadoSet);
      if (user?.estado && estadoSet.includes(user.estado)) {
        setSelectedEstado(user.estado);
      } else if (estadoSet.length > 0) {
        setSelectedEstado(estadoSet[0]);
      }
    }).catch((err) => console.error("Erro ao carregar estados IPS:", err));
  }, [selectedAno]);

  // Load city list when estado changes
  useEffect(() => {
    if (!selectedEstado) return;
    api
      .get("/ips/municipios", { params: { ano: selectedAno, estado: selectedEstado } })
      .then((res) => {
        setMunicipios(res.data);
        const userCity = res.data.find((m) => m.municipio_id === user?.municipio_id);
        setSelectedMunicipioId(
          userCity ? userCity.municipio_id : res.data[0]?.municipio_id ?? null
        );
      })
      .catch((err) => console.error("Erro ao carregar municípios IPS:", err));
  }, [selectedEstado, selectedAno]);

  // Load all data when city/year changes
  useEffect(() => {
    if (!selectedMunicipioId) return;
    setLoading(true);
    const params = { municipio_id: selectedMunicipioId, ano: selectedAno };
    Promise.all([
      api.get("/ips/scorecard", { params }),
      api.get("/ips/evolucao", { params: { municipio_id: selectedMunicipioId } }),
      api.get("/ips/ranking", { params }),
      api.get("/ips/destaques", { params }),
      api.get("/ips/sugestoes", { params: { ...params, limit: 6 } }),
    ])
      .then(([sc, ev, rk, dest, sug]) => {
        setScorecard(sc.data);
        setEvolucao(ev.data);
        setRanking(rk.data);
        setDestaques(dest.data);
        setSugestoes(sug.data);
        setCompareMunicipioIds([]);
      })
      .catch((err) => console.error("Erro ao carregar dados IPS:", err))
      .finally(() => setLoading(false));
  }, [selectedMunicipioId, selectedAno]);

  // Load comparativo when compare ids change
  useEffect(() => {
    if (!selectedMunicipioId) return;
    const allIds = [selectedMunicipioId, ...compareMunicipioIds];
    api
      .get("/ips/comparativo", {
        params: {
          municipio_id: selectedMunicipioId,
          ano: selectedAno,
          municipio_ids: allIds.join(","),
        },
      })
      .then((res) => setComparativo(res.data))
      .catch((err) => console.error("Erro ao carregar comparativo IPS:", err));
  }, [selectedMunicipioId, selectedAno, compareMunicipioIds]);

  function addCompare(municipioId) {
    if (!compareMunicipioIds.includes(municipioId) && municipioId !== selectedMunicipioId) {
      setCompareMunicipioIds((prev) => [...prev, municipioId]);
    }
  }

  function removeCompare(municipioId) {
    setCompareMunicipioIds((prev) => prev.filter((id) => id !== municipioId));
  }

  const perfilData = useMemo(
    () =>
      COMPONENTS.map((c) => ({
        label: c.label,
        value: scorecard?.[c.key] ?? 0,
      })),
    [scorecard]
  );

  const comparativoData = useMemo(() => {
    const keys = [
      "ips_geral",
      "necessidades_humanas_basicas",
      "fundamentos_bem_estar",
      "oportunidades",
    ];
    const labels = { ips_geral: "IPS Geral", necessidades_humanas_basicas: "NHB", fundamentos_bem_estar: "FBE", oportunidades: "OPO" };
    return keys.map((k) => ({
      name: labels[k],
      ...Object.fromEntries(comparativo.map((c) => [c.nome, c[k] ?? 0])),
    }));
  }, [comparativo]);

  const pibPerCapita = scorecard?.pib_per_capita
    ? `R$ ${Number(scorecard.pib_per_capita).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
    : "—";
  const pibSub = [
    scorecard?.populacao && `Pop. ${scorecard.populacao.toLocaleString("pt-BR")}`,
    scorecard?.area_km2 && `Área ${Number(scorecard.area_km2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km²`,
  ].filter(Boolean).join(" · ");

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader
          title="IPS"
          sub="Índice de Progresso Social — avaliação multidimensional da qualidade de vida, de 0 a 100"
        />
        <InfoTooltip dataset="ips" />
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--text-mute)] mb-1">Estado</label>
          <NidSelect
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            ariaLabel="Filtrar por estado"
          >
            {estados.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </NidSelect>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs text-[var(--text-mute)] mb-1">Município</label>
          <MunicipioPicker
            municipios={municipios.map((m) => ({ ...m, id: m.municipio_id }))}
            value={selectedMunicipioId ?? ""}
            onChange={(id) => setSelectedMunicipioId(id ? Number(id) : null)}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-mute)] mb-1">Ano</label>
          <div className="flex" style={{ gap: 6 }}>
            {[2024, 2025].map((a) => (
              <button
                key={a}
                onClick={() => setSelectedAno(a)}
                className={`nid-tab ${selectedAno === a ? "active" : ""}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      )}

      {!loading && scorecard && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="IPS Geral"
              value={fmt(scorecard.ips_geral)}
              sub="de 100"
              accent={scoreAccent(scorecard.ips_geral)}
              dataset="ips"
              indicadorKey="ips_geral"
            />
            <KpiCard
              label="Ranking Nacional"
              value={ranking ? `${ranking.ranking_nacional}º` : "—"}
              sub={ranking ? `de ${ranking.total_nacional.toLocaleString("pt-BR")} municípios` : ""}
              dataset="ips"
              indicadorKey="ranking_nacional"
            />
            <KpiCard
              label="Ranking Estadual"
              value={ranking ? `${ranking.ranking_estadual}º` : "—"}
              sub={ranking ? `de ${ranking.total_estadual.toLocaleString("pt-BR")} em ${selectedEstado}` : ""}
              dataset="ips"
              indicadorKey="ranking_estadual"
            />
            <KpiCard
              label="PIB per capita"
              value={pibPerCapita}
              sub={pibSub}
              dataset="ips"
              indicadorKey="pib_per_capita"
            />
          </div>

          {/* Dimensões */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DIMENSIONS.map((d) => (
              <KpiCard
                key={d.key}
                label={d.short}
                value={fmt(scorecard[d.key])}
                sub={d.label}
                accent={scoreAccent(scorecard[d.key])}
                dataset="ips"
                indicadorKey={d.key}
              />
            ))}
          </div>

          <NidPanel title="Perfil por Componente" dataset="ips" indicadorKey="chart_perfil_componente" sub="Score de cada componente · de 100">
            <HBarChart
              data={perfilData}
              color="var(--accent-1)"
              fmt={(v) => `${fmt(v)} de 100`}
              emptyMessage="Sem dados disponíveis"
            />
          </NidPanel>

          {destaques && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NidPanel title="Pontos Fortes" dataset="ips" indicadorKey="chart_pontos_fortes" sub="Maiores diferenças positivas vs. média estadual">
                <div className="space-y-3">
                  {destaques.melhores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--text-dim)]">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-5)" }}>{fmt(d.valor)}</span>
                        <span className="text-xs text-[var(--text-mute)] ml-1">(+{fmt(d.diferenca)} vs média)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </NidPanel>
              <NidPanel title="Pontos a Melhorar" dataset="ips" indicadorKey="chart_pontos_melhorar" sub="Maiores diferenças negativas vs. média estadual">
                <div className="space-y-3">
                  {destaques.piores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--text-dim)]">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>{fmt(d.valor)}</span>
                        <span className="text-xs text-[var(--text-mute)] ml-1">({fmt(d.diferenca)} vs média)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </NidPanel>
            </div>
          )}

          {/* Detalhamento por Dimensão (colapsável) */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text)]">Detalhamento por Dimensão</h2>
            {[
              { dimKey: "nhb", label: "Necessidades Humanas Básicas" },
              { dimKey: "fbe", label: "Fundamentos do Bem-estar" },
              { dimKey: "opo", label: "Oportunidades" },
            ].map(({ dimKey, label }) => {
              const comps = COMPONENTS.filter((c) => c.dim === dimKey);
              const subs = SUB_INDICATORS.filter((s) => s.dim === dimKey);
              return (
                <div key={dimKey} className="nid-panel overflow-hidden" style={{ padding: 0 }}>
                  <button
                    onClick={() => setOpenDims((p) => ({ ...p, [dimKey]: !p[dimKey] }))}
                    className="w-full flex justify-between items-center p-5 text-left cursor-pointer"
                  >
                    <span className="font-medium text-[var(--text)]">{label}</span>
                    <span className="text-[var(--text-mute)] text-sm">{openDims[dimKey] ? "▲" : "▼"}</span>
                  </button>
                  {openDims[dimKey] && (
                    <div className="px-5 pb-5 space-y-2 border-t border-[var(--border)] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-mute)] mb-3">
                        Componentes
                      </p>
                      {comps.map((c) => {
                        const v = scorecard[c.key];
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-dim)] w-48 flex-shrink-0">{c.label}</span>
                            <div className="flex-1">
                              <BarraExecucao pct={v} label={fmt(v)} />
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-mute)] mt-4 mb-3">
                        Sub-indicadores
                      </p>
                      {subs.map((s) => {
                        const v = scorecard[s.key];
                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-dim)] w-48 flex-shrink-0">{s.label}</span>
                            <div className="flex-1">
                              <BarraExecucao pct={v} label={fmt(v)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {evolucao.length > 0 && (
            <NidPanel title="Evolução ao Longo do Tempo" dataset="ips" indicadorKey="chart_evolucao_tempo" sub="IPS geral e dimensões por ano">
              <MultiLineChart
                data={evolucao.map((d) => ({
                  label: String(d.ano),
                  "IPS Geral": d.ips_geral || 0,
                  "NHB": d.necessidades_humanas_basicas || 0,
                  "FBE": d.fundamentos_bem_estar || 0,
                  "OPO": d.oportunidades || 0,
                }))}
                series={["IPS Geral", "NHB", "FBE", "OPO"]}
                colors={["var(--accent-1)", "var(--accent-5)", "var(--accent-4)", "var(--accent-3)"]}
                height={220}
                yFmt={(v) => v.toFixed(1)}
                tipFmt={(v) => v.toFixed(1)}
                legend
                emptyMessage="Sem histórico disponível"
              />
              {evolucao.length >= 2 && (() => {
                const last = evolucao[evolucao.length - 1];
                const prev = evolucao[evolucao.length - 2];
                const delta = (last.ips_geral ?? 0) - (prev.ips_geral ?? 0);
                return (
                  <p className="text-sm mt-3 font-medium" style={{ color: delta >= 0 ? "var(--accent-5)" : "var(--accent-2)" }}>
                    {delta >= 0 ? "+" : ""}{fmt(delta)} pontos de {prev.ano} para {last.ano}
                  </p>
                );
              })()}
            </NidPanel>
          )}

          <NidPanel title="Comparar com Outros Municípios" dataset="ips" indicadorKey="chart_comparar_municipios" sub="Municípios semelhantes por PIB per capita">
            <div className="space-y-4">
              {sugestoes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s.municipio_id}
                      onClick={() => addCompare(s.municipio_id)}
                      disabled={compareMunicipioIds.includes(s.municipio_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        compareMunicipioIds.includes(s.municipio_id)
                          ? "bg-[var(--panel-2)] border-[var(--border)] text-[var(--accent-1)]"
                          : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
                      }`}
                    >
                      {s.nome} ({s.estado}) — {fmt(s.ips_geral)}
                    </button>
                  ))}
                </div>
              )}

              {compareMunicipioIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {compareMunicipioIds.map((id) => {
                    const m = comparativo.find((c) => c.municipio_id === id);
                    return m ? (
                      <span
                        key={id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border"
                        style={{ background: "var(--panel-2)", borderColor: "var(--accent-1)", color: "var(--accent-1)" }}
                      >
                        {m.nome}
                        <button onClick={() => removeCompare(id)} className="ml-1 hover:opacity-70 cursor-pointer">✕</button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}

              {comparativo.length > 0 && (
                <MultiLineChart
                  data={comparativoData.map((d) => ({ label: d.name, ...d }))}
                  series={comparativo.map((c) => c.nome)}
                  colors={SERIES_COLORS}
                  height={250}
                  yFmt={(v) => v.toFixed(1)}
                  tipFmt={(v) => v.toFixed(1)}
                  legend
                />
              )}
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
