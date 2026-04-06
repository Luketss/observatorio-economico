import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../services/api";
import {
  NewspaperIcon,
  PencilSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  XMarkIcon,
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

const DATASET_LABEL = Object.fromEntries(DATASETS.map((d) => [d.key, d.label]));

function getLabel(dataset) {
  const key = dataset.replace(/^release_/, "");
  return DATASET_LABEL[key] || key;
}

function fmtDate(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Badge({ modelo }) {
  const isEspecialista = modelo === "especialista";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isEspecialista
          ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400"
          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
      }`}
    >
      {isEspecialista ? <PencilSquareIcon className="w-3 h-3" /> : <NewspaperIcon className="w-3 h-3" />}
      {isEspecialista ? "Especialista" : "IA"}
    </span>
  );
}

export default function ReleasesAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState({});
  const [previewModal, setPreviewModal] = useState(null);
  const [manualModal, setManualModal] = useState(null); // { key, label }
  const [manualText, setManualText] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [addingDataset, setAddingDataset] = useState("");

  useEffect(() => {
    api.get("/municipios").then((r) => setMunicipios(r.data || []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api
      .get("/insights/admin_releases", { params: { municipio_id: selectedId } })
      .then((r) => setReleases(r.data || []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const municipioNome = municipios.find((m) => m.id === parseInt(selectedId))?.nome || "Município";

  const handleToggleAtivo = async (release) => {
    setActing((prev) => ({ ...prev, [release.id]: true }));
    try {
      const res = await api.patch(`/insights/${release.id}`, { ativo: !release.ativo });
      setReleases((prev) => prev.map((r) => (r.id === release.id ? res.data : r)));
    } finally {
      setActing((prev) => ({ ...prev, [release.id]: false }));
    }
  };

  const handleDelete = async (release) => {
    if (!confirm(`Excluir release "${getLabel(release.dataset)}"? Esta ação não pode ser desfeita.`)) return;
    setActing((prev) => ({ ...prev, [release.id]: true }));
    try {
      await api.delete(`/insights/${release.id}`);
      setReleases((prev) => prev.filter((r) => r.id !== release.id));
    } finally {
      setActing((prev) => ({ ...prev, [release.id]: false }));
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
      // Replace or add in the list
      setReleases((prev) => {
        const exists = prev.find((r) => r.dataset === res.data.dataset);
        if (exists) return prev.map((r) => (r.dataset === res.data.dataset ? res.data : r));
        return [res.data, ...prev];
      });
      setManualModal(null);
      setManualText("");
      setAddingDataset("");
    } catch (err) {
      console.error("Erro ao inserir release:", err.response?.data?.detail || err.message);
    } finally {
      setSubmittingManual(false);
    }
  };

  const handlePrint = (release) => {
    const label = getLabel(release.dataset);
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
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; max-width: 720px; margin: 0 auto; padding: 48px 40px; }
    header { border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 28px; }
    .tag { font-size: 8.5pt; font-weight: bold; letter-spacing: .12em; text-transform: uppercase; color: #666; margin-bottom: 8px; }
    h1 { font-size: 22pt; font-weight: bold; line-height: 1.2; margin-bottom: 8px; }
    .meta { font-size: 9pt; color: #555; font-style: italic; }
    .body p { margin-bottom: 1.4em; text-align: justify; }
    @media print { body { padding: 0; max-width: 100%; } @page { margin: 2cm; } }
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

  // Datasets that don't yet have a release (for the "add" selector)
  const existingDatasets = new Set(releases.map((r) => r.dataset.replace(/^release_/, "")));
  const availableToAdd = DATASETS.filter((d) => !existingDatasets.has(d.key));

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
          Releases por Município
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Gerencie e insira releases de imprensa (IA e especialista) por município.
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
          className="w-full max-w-sm border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Selecione um município...</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.estado}
            </option>
          ))}
        </select>
      </div>

      {/* Releases list */}
      {selectedId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Releases</h3>

            {/* Add manual release for a new dataset */}
            {availableToAdd.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={addingDataset}
                  onChange={(e) => setAddingDataset(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Novo release para...</option>
                  {availableToAdd.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <button
                  disabled={!addingDataset}
                  onClick={() => {
                    const d = DATASETS.find((x) => x.key === addingDataset);
                    setManualModal({ key: d.key, label: d.label });
                    setManualText("");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                  Inserir Manual
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : releases.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              Nenhum release gerado para este município.
            </div>
          ) : (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {releases.map((release) => (
                <div
                  key={release.id}
                  className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                    release.ativo
                      ? "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                      : "border-orange-100 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20 opacity-75"
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                        {getLabel(release.dataset)}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {fmtDate(release.gerado_em)}
                      </p>
                    </div>
                    <Badge modelo={release.modelo} />
                  </div>

                  {/* Preview */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {release.bullets[0]}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-auto pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setPreviewModal(release)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-400 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => handleToggleAtivo(release)}
                      disabled={acting[release.id]}
                      title={release.ativo ? "Ocultar" : "Mostrar"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors disabled:opacity-40"
                    >
                      {release.ativo ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5 text-orange-500" />}
                    </button>
                    <button
                      onClick={() => handleDelete(release)}
                      disabled={acting[release.id]}
                      title="Excluir"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                    {/* Allow re-editing manual releases */}
                    {release.modelo === "especialista" && (
                      <button
                        onClick={() => {
                          const key = release.dataset.replace(/^release_/, "");
                          const d = DATASETS.find((x) => x.key === key);
                          setManualModal({ key, label: d?.label || key });
                          setManualText(release.bullets.join("\n\n"));
                        }}
                        title="Editar conteúdo"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                      >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {previewModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewModal(null)}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                      Release de Imprensa
                    </p>
                    <Badge modelo={previewModal.modelo} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white">
                    {getLabel(previewModal.dataset)} — {municipioNome}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {fmtDate(previewModal.gerado_em)}
                  </p>
                </div>
                <button onClick={() => setPreviewModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-4">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {previewModal.bullets.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{p}</p>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setPreviewModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => handlePrint(previewModal)}
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

      {/* Manual insertion modal */}
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
                    {manualText ? "Editar" : "Inserir"} Release — {manualModal.label}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {municipioNome} · Separe os parágrafos com uma linha em branco.
                  </p>
                </div>
                <button onClick={() => setManualModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-4">
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
                  {submittingManual ? "Salvando..." : "Salvar Release"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
