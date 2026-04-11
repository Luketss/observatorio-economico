import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../services/api";
import {
  SparklesIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  NewspaperIcon,
  XMarkIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

const DATASETS = [
  { key: "geral", label: "Visão Geral" },
  { key: "arrecadacao", label: "Arrecadação" },
  { key: "pib", label: "PIB" },
  { key: "caged", label: "CAGED" },
  { key: "rais", label: "RAIS" },
  { key: "bolsa_familia", label: "Bolsa Família" },
  { key: "pe_de_meia", label: "Pé-de-Meia" },
  { key: "inss", label: "INSS" },
  { key: "estban", label: "Bancos (Estban)" },
  { key: "comex", label: "Comércio Exterior" },
  { key: "empresas", label: "Empresas" },
  { key: "pix", label: "PIX" },
];

function fmtDate(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function InsightsAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [insights, setInsights] = useState({});
  const [releases, setReleases] = useState({});
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generating, setGenerating] = useState({});
  const [generatingRelease, setGeneratingRelease] = useState({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [acting, setActing] = useState({});
  const [releaseModal, setReleaseModal] = useState(null);
  const [manualModal, setManualModal] = useState(null); // { key, label }
  const [manualText, setManualText] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);

  useEffect(() => {
    api.get("/municipios").then((r) => setMunicipios(r.data || []));
  }, []);

  const loadInsights = (id) => {
    setLoadingInsights(true);
    setInsights({});
    setReleases({});
    Promise.all([
      api.get("/insights/admin", { params: { municipio_id: id } }),
      api.get("/insights/admin_releases", { params: { municipio_id: id } }),
    ])
      .then(([insRes, relRes]) => {
        const map = {};
        (insRes.data || []).forEach((ins) => { map[ins.dataset] = ins; });
        setInsights(map);

        const relMap = {};
        (relRes.data || []).forEach((ins) => {
          const baseKey = ins.dataset.replace(/^release_/, "");
          relMap[baseKey] = ins;
        });
        setReleases(relMap);
      })
      .catch(() => { setInsights({}); setReleases({}); })
      .finally(() => setLoadingInsights(false));
  };

  useEffect(() => {
    if (!selectedId) return;
    loadInsights(selectedId);
  }, [selectedId]);

  const handleGerar = async (dataset) => {
    setGenerating((prev) => ({ ...prev, [dataset]: true }));
    try {
      const res = await api.post("/insights/gerar", {
        dataset,
        municipio_id: parseInt(selectedId),
      });
      setInsights((prev) => ({ ...prev, [dataset]: res.data }));
    } catch (err) {
      console.error("Erro ao gerar insight:", err.response?.data?.detail || err.message);
    } finally {
      setGenerating((prev) => ({ ...prev, [dataset]: false }));
    }
  };

  const handleGerarRelease = async (dataset) => {
    setGeneratingRelease((prev) => ({ ...prev, [dataset]: true }));
    try {
      const res = await api.post("/insights/gerar_release", {
        dataset,
        municipio_id: parseInt(selectedId),
      });
      const baseKey = res.data.dataset.replace(/^release_/, "");
      setReleases((prev) => ({ ...prev, [baseKey]: res.data }));
    } catch (err) {
      console.error("Erro ao gerar release:", err.response?.data?.detail || err.message);
    } finally {
      setGeneratingRelease((prev) => ({ ...prev, [dataset]: false }));
    }
  };

  const handleGerarTodos = async () => {
    setGeneratingAll(true);
    for (const d of DATASETS) {
      await handleGerar(d.key);
    }
    setGeneratingAll(false);
  };

  const handleToggleAtivo = async (insight) => {
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      const res = await api.patch(`/insights/${insight.id}`, { ativo: !insight.ativo });
      setInsights((prev) => ({ ...prev, [insight.dataset]: res.data }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
  };

  const handleTogglePlanoFree = async (insight) => {
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      const currently_hidden = insight.oculto_planos?.includes("free");
      const next = currently_hidden
        ? insight.oculto_planos.filter((p) => p !== "free")
        : [...(insight.oculto_planos || []), "free"];
      const res = await api.patch(`/insights/${insight.id}`, { oculto_planos: next });
      setInsights((prev) => ({ ...prev, [insight.dataset]: res.data }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
  };

  const handleDelete = async (insight) => {
    if (!confirm(`Excluir insight de "${insight.dataset}"? Esta ação não pode ser desfeita.`)) return;
    setActing((prev) => ({ ...prev, [insight.id]: true }));
    try {
      await api.delete(`/insights/${insight.id}`);
      setInsights((prev) => ({ ...prev, [insight.dataset]: null }));
    } finally {
      setActing((prev) => ({ ...prev, [insight.id]: false }));
    }
  };

  const handleInserirManual = async () => {
    if (!manualText.trim()) return;
    setSubmittingManual(true);
    try {
      const paragrafos = manualText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const res = await api.post("/insights/inserir_release", {
        dataset: manualModal.key,
        municipio_id: parseInt(selectedId),
        paragrafos,
      });
      const baseKey = res.data.dataset.replace(/^release_/, "");
      setReleases((prev) => ({ ...prev, [baseKey]: res.data }));
      setManualModal(null);
      setManualText("");
    } catch (err) {
      console.error("Erro ao inserir release manual:", err.response?.data?.detail || err.message);
    } finally {
      setSubmittingManual(false);
    }
  };

  const handlePrintRelease = (release, label, municipioNome) => {
    const dataGerado = new Date(release.gerado_em).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Release — ${label} — ${municipioNome}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
      background: white;
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 40px;
    }
    header {
      border-bottom: 3px solid #1a1a1a;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }
    .tag {
      font-size: 8.5pt;
      font-weight: bold;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 22pt;
      font-weight: bold;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .meta {
      font-size: 9pt;
      color: #555;
      font-style: italic;
    }
    .body p {
      margin-bottom: 1.4em;
      text-align: justify;
      hyphens: auto;
    }
    @media print {
      body { padding: 0; max-width: 100%; }
      @page { margin: 2cm; }
    }
  </style>
</head>
<body>
  <header>
    <div class="tag">Release de Imprensa</div>
    <h1>Prefeitura de ${municipioNome}</h1>
    <div class="meta">${label} &mdash; ${dataGerado}</div>
  </header>
  <div class="body">
    ${release.bullets.map((p) => `<p>${p}</p>`).join("\n    ")}
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  };

  const municipioNome = municipios.find((m) => m.id === parseInt(selectedId))?.nome || "Município";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Insights IA
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Gere insights, releases de imprensa e gerencie visibilidade por município.
        </p>
      </div>

      {/* Municipality selector */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
          Município
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-sm border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Selecione um município...</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.estado}
            </option>
          ))}
        </select>
      </div>

      {/* Dataset table */}
      {selectedId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Datasets</h3>
            <button
              onClick={handleGerarTodos}
              disabled={generatingAll || loadingInsights}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              <SparklesIcon className={`w-4 h-4 ${generatingAll ? "animate-pulse" : ""}`} />
              {generatingAll ? "Gerando todos..." : "Gerar Todos"}
            </button>
          </div>

          {loadingInsights ? (
            <div className="p-6 space-y-3">
              {DATASETS.map((d) => (
                <div key={d.key} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  <th className="px-3 py-3 md:px-6">Dataset</th>
                  <th className="px-3 py-3 md:px-6">Status</th>
                  <th className="px-3 py-3 md:px-6">Última geração</th>
                  <th className="px-3 py-3 md:px-6">Visibilidade</th>
                  <th className="px-3 py-3 md:px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {DATASETS.map((d) => {
                  const existing = insights[d.key];
                  const existingRelease = releases[d.key];
                  const isGenerating = generating[d.key];
                  const isGeneratingRelease = generatingRelease[d.key];
                  const isActing = existing && acting[existing.id];
                  const hiddenFromFree = existing?.oculto_planos?.includes("free");

                  return (
                    <tr key={d.key} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      {/* Dataset name */}
                      <td className="px-3 py-4 md:px-6 font-medium text-slate-800 dark:text-white">
                        {d.label}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-4 md:px-6">
                        {!existing ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Não gerado
                          </span>
                        ) : !existing.ativo ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-lg">
                            <EyeSlashIcon className="w-3.5 h-3.5" />
                            Oculto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Ativo
                          </span>
                        )}
                      </td>

                      {/* Last generated */}
                      <td className="px-3 py-4 md:px-6 text-slate-400 dark:text-slate-500 text-xs">
                        {existing ? fmtDate(existing.gerado_em) : "—"}
                      </td>

                      {/* Visibility controls */}
                      <td className="px-3 py-4 md:px-6">
                        {existing && (
                          <button
                            onClick={() => handleTogglePlanoFree(existing)}
                            disabled={isActing}
                            title={hiddenFromFree ? "Mostrar para plano gratuito" : "Ocultar para plano gratuito"}
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                              hiddenFromFree
                                ? "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                : "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100"
                            }`}
                          >
                            {hiddenFromFree ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                            {hiddenFromFree ? "Oculto (free)" : "Visível (free)"}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-4 md:px-6">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {/* Insight actions */}
                          <button
                            onClick={() => handleGerar(d.key)}
                            disabled={isGenerating || generatingAll}
                            title={existing ? "Regenerar insight" : "Gerar insight"}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 dark:hover:text-violet-400 disabled:opacity-40 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40"
                          >
                            <ArrowPathIcon className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                            {isGenerating ? "Gerando..." : existing ? "Regenerar" : "Gerar"}
                          </button>

                          {existing && (
                            <>
                              <button
                                onClick={() => handleToggleAtivo(existing)}
                                disabled={isActing}
                                title={existing.ativo ? "Ocultar para todos" : "Mostrar para todos"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors disabled:opacity-40"
                              >
                                {existing.ativo
                                  ? <EyeSlashIcon className="w-3.5 h-3.5" />
                                  : <EyeIcon className="w-3.5 h-3.5 text-orange-500" />}
                              </button>
                              <button
                                onClick={() => handleDelete(existing)}
                                disabled={isActing}
                                title="Excluir insight"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* Separator */}
                          <span className="mx-1 text-slate-200 dark:text-slate-700 select-none">|</span>

                          {/* Release actions */}
                          <button
                            onClick={() => handleGerarRelease(d.key)}
                            disabled={isGeneratingRelease}
                            title={existingRelease ? "Regenerar release de imprensa (IA)" : "Gerar release de imprensa (IA)"}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 disabled:opacity-40 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            <NewspaperIcon className={`w-3.5 h-3.5 ${isGeneratingRelease ? "animate-pulse" : ""}`} />
                            {isGeneratingRelease ? "Gerando..." : existingRelease ? "Regen. IA" : "Gerar IA"}
                          </button>

                          <button
                            onClick={() => { setManualModal({ key: d.key, label: d.label }); setManualText(""); }}
                            title="Inserir release redigido por especialista"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/40"
                          >
                            <PencilSquareIcon className="w-3.5 h-3.5" />
                            Manual
                          </button>

                          {existingRelease && (
                            <button
                              onClick={() => setReleaseModal({ dataset: d.key, label: d.label, release: existingRelease })}
                              title="Ver e baixar release"
                              className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-400 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                            >
                              Ver Release
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Legend */}
      {selectedId && !loadingInsights && (
        <div className="flex items-center gap-6 text-xs text-slate-400 dark:text-slate-500 px-1 flex-wrap">
          <span className="flex items-center gap-1.5"><EyeSlashIcon className="w-3.5 h-3.5" /> Ocultar para todos os usuários</span>
          <span className="flex items-center gap-1.5"><EyeIcon className="w-3.5 h-3.5" /> Visibilidade no plano gratuito</span>
          <span className="flex items-center gap-1.5"><TrashIcon className="w-3.5 h-3.5" /> Remove permanentemente</span>
          <span className="flex items-center gap-1.5"><NewspaperIcon className="w-3.5 h-3.5" /> Release de imprensa (PDF)</span>
        </div>
      )}

      {/* Release preview modal */}
      <AnimatePresence>
        {releaseModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReleaseModal(null)}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-1">
                    Release de Imprensa
                  </p>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white">
                    {releaseModal.label} — {municipioNome}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Gerado em {fmtDate(releaseModal.release.gerado_em)}
                  </p>
                </div>
                <button
                  onClick={() => setReleaseModal(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-4"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal body — 5 paragraphs */}
              <div className="p-6 space-y-4">
                {releaseModal.release.bullets.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setReleaseModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => handlePrintRelease(releaseModal.release, releaseModal.label, municipioNome)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                >
                  <NewspaperIcon className="w-4 h-4" />
                  Imprimir / Baixar PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual release insertion modal */}
      <AnimatePresence>
        {manualModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setManualModal(null)}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400 font-semibold mb-1">
                    Especialista
                  </p>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white">
                    Inserir Release Manual — {manualModal.label}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {municipioNome} · Separe os parágrafos com uma linha em branco.
                  </p>
                </div>
                <button
                  onClick={() => setManualModal(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-4"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={10}
                  placeholder={"Parágrafo 1...\n\nParágrafo 2...\n\nParágrafo 3..."}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setManualModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleInserirManual}
                  disabled={submittingManual || !manualText.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                  {submittingManual ? "Salvando..." : "Inserir Release"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
