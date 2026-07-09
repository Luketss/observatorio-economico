import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import MunicipioPicker from "../../components/nid/MunicipioPicker";

const ESTADOS_UF = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const JOB_ATIVO = ["pendente", "executando"];

function labelStatus(status) {
  return {
    pendente: "Na fila", executando: "Executando", concluido: "Concluído",
    erro: "Erro", abortado: "Abortado",
  }[status] || status;
}

function duracao(job) {
  if (!job?.iniciado_em || !job?.finalizado_em) return "—";
  const s = Math.round((new Date(job.finalizado_em) - new Date(job.iniciado_em)) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}`;
}

/**
 * ADMIN_GLOBAL page: metadados de fonte por dataset + esteira de fontes
 * automáticas com execução em background (job + polling de progresso).
 */
export default function DatasetFontesAdminPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [autoFontes, setAutoFontes] = useState([]);
  const [notificar, setNotificar] = useState(true);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [municipios, setMunicipios] = useState([]);
  const [municipiosSel, setMunicipiosSel] = useState([]); // [{id, nome, estado}]
  const [anosText, setAnosText] = useState("");
  const [job, setJob] = useState(null);          // job ativo (polled)
  const [historico, setHistorico] = useState([]);
  const pollRef = useRef(null);

  const jobAtivo = job && JOB_ATIVO.includes(job.status);

  useEffect(() => {
    Promise.all([api.get("/municipios/datasets"), api.get("/dataset-info/all")])
      .then(([catalogRes, infoRes]) => {
        const infoByKey = Object.fromEntries(
          (infoRes.data || []).map((i) => [i.dataset, i])
        );
        setRows((catalogRes.data || []).map((d) => {
          const info = infoByKey[d.key] || {};
          return {
            key: d.key, label: d.label,
            fonte: info.fonte || "",
            data_atualizacao: info.data_atualizacao || "",
          };
        }));
      })
      .catch(() => addToast("Erro ao carregar fontes de dados.", "error"))
      .finally(() => setLoading(false));
    api.get("/municipios").then((r) => setMunicipios(r.data || [])).catch(() => {});
    loadAutoFontes();
    loadHistorico();
    return () => clearInterval(pollRef.current);
  }, []);

  const loadAutoFontes = () =>
    api.get("/ingestao-automatica/fontes")
      .then((r) => {
        setAutoFontes(r.data?.fontes || []);
        if (r.data?.job_ativo) startPolling(r.data.job_ativo);
      })
      .catch(() => {});

  const loadHistorico = () =>
    api.get("/ingestao-automatica/jobs", { params: { limit: 10 } })
      .then((r) => setHistorico(r.data || []))
      .catch(() => {});

  const startPolling = (jobInicial) => {
    setJob(jobInicial);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/ingestao-automatica/jobs/${jobInicial.id}`);
        setJob(data);
        if (!JOB_ATIVO.includes(data.status)) {
          clearInterval(pollRef.current);
          const r = data.resumo || {};
          if (data.status === "concluido") {
            addToast(
              `${data.dataset}: ${r.municipios_ok ?? 0} município(s), ${r.linhas ?? 0} linha(s)` +
                (r.notificacoes ? `, ${r.notificacoes} notificação(ões)` : "") +
                (r.municipios_erro ? ` — ${r.municipios_erro} com erro` : ""),
              r.municipios_erro ? "warning" : "success"
            );
          } else {
            addToast(`${data.dataset}: ${labelStatus(data.status)} — ${data.erro || "sem detalhe"}`, "error");
          }
          setJob(null);
          loadAutoFontes();
          loadHistorico();
        }
      } catch {
        /* mantém polling; erro transitório de rede */
      }
    }, 3000);
  };

  const handleExecutar = async (fonte) => {
    try {
      const body = {
        notificar,
        ...(estadoFiltro ? { estado: estadoFiltro } : {}),
        ...(municipiosSel.length ? { municipio_ids: municipiosSel.map((m) => m.id) } : {}),
      };
      const anos = anosText.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (anos.length) body.anos = anos;
      const { data } = await api.post(`/ingestao-automatica/${fonte.key}/executar`, body);
      addToast(`${fonte.label}: execução iniciada em segundo plano.`, "success");
      startPolling({ id: data.job_id, dataset: fonte.key, status: "pendente" });
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao iniciar a execução.", "error");
    }
  };

  const addMunicipio = (idStr) => {
    if (!idStr) return;
    const m = municipios.find((x) => String(x.id) === String(idStr));
    if (m && !municipiosSel.some((x) => x.id === m.id)) {
      setMunicipiosSel((prev) => [...prev, m]);
    }
  };

  const updateField = (key, field, value) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const handleSave = async (row) => {
    setSavingKey(row.key);
    try {
      await api.put(`/dataset-info/${row.key}`, {
        fonte: row.fonte, data_atualizacao: row.data_atualizacao,
      });
      addToast(`Fonte de "${row.label}" salva.`, "success");
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao salvar.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleClear = async (row) => {
    if (!confirm(`Limpar fonte e data de atualização de "${row.label}"?`)) return;
    setSavingKey(row.key);
    try {
      await api.delete(`/dataset-info/${row.key}`);
      updateField(row.key, "fonte", "");
      updateField(row.key, "data_atualizacao", "");
      addToast(`Fonte de "${row.label}" removida.`, "success");
    } catch (err) {
      if (err.response?.status === 404) {
        updateField(row.key, "fonte", "");
        updateField(row.key, "data_atualizacao", "");
      } else {
        addToast(err.response?.data?.detail || "Erro ao remover.", "error");
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Fontes de Dados
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Defina a fonte e a data de atualização de cada conjunto de dados de
          ingestão. Essas informações aparecem como tooltip nas páginas de dados.
        </p>
      </div>

      {autoFontes.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Fontes automáticas</h2>
              <p className="text-sm text-[var(--text-mute)]">
                Buscam dados direto das APIs públicas — sem CSV. A execução roda em segundo
                plano; acompanhe o progresso aqui e no histórico abaixo.
              </p>
              {estadoFiltro === "" && municipiosSel.length === 0 && (
                <p className="text-xs mt-1 text-amber-500">
                  Sem filtro, a execução cobre todos os municípios do Brasil e pode levar muito tempo.
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                Estado
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
                >
                  <option value="">Todos os estados</option>
                  {ESTADOS_UF.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2 text-sm text-[var(--text-dim)] min-w-[260px]">
                Municípios
                <div className="flex-1">
                  <MunicipioPicker
                    municipios={municipios}
                    value=""
                    onChange={addMunicipio}
                    placeholder="Adicionar município…"
                    ariaLabel="Adicionar município ao filtro"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                Anos
                <input
                  value={anosText}
                  onChange={(e) => setAnosText(e.target.value)}
                  placeholder="ex.: 2024, 2025"
                  className="w-32 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} className="rounded" />
                Gerar notificações
              </label>
            </div>
            {municipiosSel.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {municipiosSel.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]">
                    {m.nome} — {m.estado}
                    <button
                      onClick={() => setMunicipiosSel((prev) => prev.filter((x) => x.id !== m.id))}
                      aria-label={`Remover ${m.nome}`}
                      className="text-[var(--text-dim)] hover:text-red-500"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {autoFontes.map((f) => {
              const esteRodando = jobAtivo && job.dataset === f.key;
              return (
                <div key={f.key} className="rounded-xl border border-[var(--border)] px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text)]">{f.label}</p>
                      <p className="text-xs text-[var(--text-mute)] truncate">{f.fonte}</p>
                      <p className="text-xs mt-0.5 text-[var(--text-dim)]">
                        {f.ultimo_job
                          ? `Último job: ${new Date(f.ultimo_job.criado_em).toLocaleString("pt-BR")} · ${labelStatus(f.ultimo_job.status)} · ${f.ultimo_job.resumo?.linhas ?? 0} linhas`
                          : "Nunca executada"}
                      </p>
                      {f.key === "captacao_federal" && (
                        <p className="text-xs mt-0.5 text-amber-500">
                          O diagnóstico de pares compara a UF inteira — prefira o filtro de estado a municípios avulsos.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleExecutar(f)}
                      disabled={jobAtivo}
                      className="px-4 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                      aria-label={`Atualizar ${f.label} agora`}
                    >
                      {esteRodando ? "Executando…" : "Atualizar agora"}
                    </button>
                  </div>
                  {esteRodando && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-[var(--text-dim)]">
                        <span>{job.etapa || labelStatus(job.status)}</span>
                        <span>
                          {job.progresso_total
                            ? `${job.progresso_atual}/${job.progresso_total} municípios`
                            : "iniciando…"}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
                        <div
                          className="h-full bg-teal-600 transition-all"
                          style={{
                            width: job.progresso_total
                              ? `${Math.min(100, (100 * job.progresso_atual) / job.progresso_total)}%`
                              : "5%",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--text)] mb-2">Histórico de execuções</h3>
            {historico.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)]">Nenhuma execução registrada.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-dim)]">
                    <th className="py-2 pr-3">Fonte</th>
                    <th className="py-2 pr-3">Quando</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Duração</th>
                    <th className="py-2 pr-3">Linhas</th>
                    <th className="py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((j) => (
                    <tr key={j.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-[var(--text)]">{j.dataset}</td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">
                        {new Date(j.criado_em).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={
                          j.status === "concluido" ? "text-emerald-500" :
                          j.status === "erro" || j.status === "abortado" ? "text-red-500" :
                          "text-amber-500"
                        }>
                          {labelStatus(j.status)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">{duracao(j)}</td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">{j.resumo?.linhas ?? "—"}</td>
                      <td className="py-2 text-[var(--text-dim)]">
                        {j.erro
                          ? j.erro.slice(0, 120)
                          : (j.resumo?.erros || []).slice(0, 2).join("; ").slice(0, 120) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--text-dim)]">
            Carregando...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Conjunto de dados</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Fonte</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Data de atualização</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--text)] align-middle">
                    {row.label}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.fonte}
                      onChange={(e) => updateField(row.key, "fonte", e.target.value)}
                      placeholder="Ex.: IBGE — SIDRA"
                      maxLength={200}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.data_atualizacao}
                      onChange={(e) => updateField(row.key, "data_atualizacao", e.target.value)}
                      placeholder="Ex.: Março/2026 ou Ano-base 2024"
                      maxLength={60}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSave(row)}
                        disabled={savingKey === row.key}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                        aria-label={`Salvar fonte de ${row.label}`}
                      >
                        <CheckIcon className="w-4 h-4" />
                        Salvar
                      </button>
                      <button
                        onClick={() => handleClear(row)}
                        disabled={savingKey === row.key || (!row.fonte && !row.data_atualizacao)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40"
                        aria-label={`Limpar fonte de ${row.label}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}
