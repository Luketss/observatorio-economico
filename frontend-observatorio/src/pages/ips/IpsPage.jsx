import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { HBarChart, MultiLineChart } from "../../components/nid/charts";

function fmt(v) {
  if (v == null) return "—";
  return Number(v).toFixed(1);
}

function scoreColor(score) {
  if (score == null) return "text-slate-400";
  if (score >= 70) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score) {
  if (score == null) return "bg-slate-100 dark:bg-slate-800";
  if (score >= 70)
    return "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800";
  if (score >= 50)
    return "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800";
  return "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800";
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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

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

  const radarData = useMemo(
    () =>
      COMPONENTS.map((c) => ({
        subject: c.label.split(" ").slice(0, 2).join(" "),
        valor: scorecard?.[c.key] ?? 0,
        fullMark: 100,
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

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          Índice de Progresso Social
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Avaliação multidimensional da qualidade de vida — escala de 0 a 100
        </p>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Estado</label>
          <select
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white px-3 py-2 text-sm"
          >
            {estados.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs text-slate-500 mb-1">Município</label>
          <select
            value={selectedMunicipioId ?? ""}
            onChange={(e) => setSelectedMunicipioId(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white px-3 py-2 text-sm"
          >
            {municipios.map((m) => (
              <option key={m.municipio_id} value={m.municipio_id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ano</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {[2024, 2025].map((a) => (
              <button
                key={a}
                onClick={() => setSelectedAno(a)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  selectedAno === a
                    ? "bg-blue-500 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400">Carregando dados...</div>
      )}

      {!loading && scorecard && (
        <>
          {/* Hero Scorecard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`rounded-2xl p-6 flex flex-col items-center justify-center ${scoreBg(
                scorecard.ips_geral
              )}`}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                IPS Geral
              </p>
              <p className={`text-6xl font-black ${scoreColor(scorecard.ips_geral)}`}>
                {fmt(scorecard.ips_geral)}
              </p>
              <p className="text-sm text-slate-400 mt-1">de 100</p>
            </div>

            <div className="rounded-2xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Ranking Nacional
              </p>
              {ranking ? (
                <>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white">
                    {ranking.ranking_nacional}º
                    <span className="text-sm font-normal text-slate-400 ml-1">
                      de {ranking.total_nacional.toLocaleString("pt-BR")}
                    </span>
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Ranking Estadual
                  </p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {ranking.ranking_estadual}º
                    <span className="text-sm font-normal text-slate-400 ml-1">
                      de {ranking.total_estadual.toLocaleString("pt-BR")}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-slate-400">—</p>
              )}
            </div>

            <div className="rounded-2xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                PIB per capita
              </p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">
                {scorecard.pib_per_capita
                  ? `R$ ${Number(scorecard.pib_per_capita).toLocaleString("pt-BR", {
                      maximumFractionDigits: 0,
                    })}`
                  : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-3">
                Desenvolvimento econômico não equivale a desenvolvimento social.
              </p>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {scorecard.populacao && (
                  <p>Populacao: {scorecard.populacao.toLocaleString("pt-BR")}</p>
                )}
                {scorecard.area_km2 && (
                  <p>
                    Area:{" "}
                    {Number(scorecard.area_km2).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    km²
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Three Dimension Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DIMENSIONS.map((d) => (
              <div key={d.key} className={`rounded-2xl p-5 ${scoreBg(scorecard[d.key])}`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {d.short}
                </p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                  {d.label}
                </p>
                <p className={`text-4xl font-black mt-2 ${scoreColor(scorecard[d.key])}`}>
                  {fmt(scorecard[d.key])}
                </p>
              </div>
            ))}
          </div>

          {/* Component Profile — HBarChart replaces RadarChart */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
              Perfil por Componente
            </h2>
            <HBarChart
              data={radarData.map((d) => ({ label: d.subject, value: d.valor }))}
              color="#3b82f6"
              fmt={(v) => `${fmt(v)} / 100`}
            />
          </div>

          {/* Strengths & Weaknesses */}
          {destaques && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
                  Pontos Fortes
                </h2>
                <div className="space-y-3">
                  {destaques.melhores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-600">{fmt(d.valor)}</span>
                        <span className="text-xs text-slate-400 ml-1">
                          (+{fmt(d.diferenca)} vs média)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
                  Pontos a Melhorar
                </h2>
                <div className="space-y-3">
                  {destaques.piores.map((d) => (
                    <div key={d.campo} className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{d.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-red-500">{fmt(d.valor)}</span>
                        <span className="text-xs text-slate-400 ml-1">
                          ({fmt(d.diferenca)} vs média)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dimension Drill-down */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Detalhamento por Dimensão
            </h2>
            {[
              { dimKey: "nhb", label: "Necessidades Humanas Básicas" },
              { dimKey: "fbe", label: "Fundamentos do Bem-estar" },
              { dimKey: "opo", label: "Oportunidades" },
            ].map(({ dimKey, label }) => {
              const comps = COMPONENTS.filter((c) => c.dim === dimKey);
              const subs = SUB_INDICATORS.filter((s) => s.dim === dimKey);
              return (
                <div
                  key={dimKey}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenDims((p) => ({ ...p, [dimKey]: !p[dimKey] }))}
                    className="w-full flex justify-between items-center p-5 text-left cursor-pointer"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
                    <span className="text-slate-400 text-sm">{openDims[dimKey] ? "▲" : "▼"}</span>
                  </button>
                  {openDims[dimKey] && (
                    <div className="px-5 pb-5 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        Componentes
                      </p>
                      {comps.map((c) => {
                        const v = scorecard[c.key];
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-48 flex-shrink-0">
                              {c.label}
                            </span>
                            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-blue-500"
                                style={{ width: `${v ?? 0}%` }}
                              />
                            </div>
                            <span
                              className={`text-sm font-bold w-10 text-right ${scoreColor(v)}`}
                            >
                              {fmt(v)}
                            </span>
                          </div>
                        );
                      })}
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-4 mb-3">
                        Sub-indicadores
                      </p>
                      {subs.map((s) => {
                        const v = scorecard[s.key];
                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 w-48 flex-shrink-0">
                              {s.label}
                            </span>
                            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-slate-400"
                                style={{ width: `${Math.min(v ?? 0, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-10 text-right">
                              {fmt(v)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Evolution */}
          {evolucao.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
                Evolução ao Longo do Tempo
              </h2>
              <MultiLineChart
                data={evolucao.map((d) => ({
                  label: String(d.ano),
                  "IPS Geral": d.ips_geral || 0,
                  "NHB": d.necessidades_humanas_basicas || 0,
                  "FBE": d.fundamentos_bem_estar || 0,
                  "OPO": d.oportunidades || 0,
                }))}
                series={["IPS Geral", "NHB", "FBE", "OPO"]}
                colors={["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"]}
                height={220}
                yFmt={(v) => v.toFixed(1)}
                tipFmt={(v) => v.toFixed(1)}
              />
              {evolucao.length >= 2 && (() => {
                const last = evolucao[evolucao.length - 1];
                const prev = evolucao[evolucao.length - 2];
                const delta = (last.ips_geral ?? 0) - (prev.ips_geral ?? 0);
                return (
                  <p
                    className={`text-sm mt-3 font-medium ${
                      delta >= 0 ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {fmt(delta)} pontos de {prev.ano} para {last.ano}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Comparison */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Comparar com Outros Municípios
            </h2>

            {sugestoes.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">
                  Municípios semelhantes (PIB per capita similar):
                </p>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s.municipio_id}
                      onClick={() => addCompare(s.municipio_id)}
                      disabled={compareMunicipioIds.includes(s.municipio_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        compareMunicipioIds.includes(s.municipio_id)
                          ? "bg-blue-100 dark:bg-blue-900 border-blue-300 text-blue-700 dark:text-blue-300"
                          : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {s.nome} ({s.estado}) — {fmt(s.ips_geral)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {compareMunicipioIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {compareMunicipioIds.map((id) => {
                  const m = comparativo.find((c) => c.municipio_id === id);
                  return m ? (
                    <span
                      key={id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500 text-white"
                    >
                      {m.nome}
                      <button
                        onClick={() => removeCompare(id)}
                        className="ml-1 hover:opacity-70 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {comparativo.length > 0 && (
              <MultiLineChart
                data={comparativoData.map((d) => ({ label: d.name, ...d }))}
                series={comparativo.map((c) => c.nome)}
                colors={COLORS}
                height={250}
                yFmt={(v) => v.toFixed(1)}
                tipFmt={(v) => v.toFixed(1)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
