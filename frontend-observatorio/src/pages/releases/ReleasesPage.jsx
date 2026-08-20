import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import api from "../../services/api";
import {
  NewspaperIcon,
  XMarkIcon,
  PencilSquareIcon,
  SparklesIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import NidSelect from "../../components/nid/NidSelect";
import { DATASET_ROUTE } from "../../utils/prioridadesForm";
import { getLabel, fmtDateRelease, abrirImpressao } from "../../utils/releaseDoc";

function Badge({ modelo }) {
  const isEspecialista = modelo === "especialista";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isEspecialista
          ? "bg-[var(--panel-2)] text-[var(--accent-1)]"
          : "bg-[var(--panel-2)] text-amber-400"
      }`}
    >
      {isEspecialista
        ? <PencilSquareIcon className="w-3 h-3" />
        : <SparklesIcon className="w-3 h-3" />}
      {isEspecialista ? "Especialista" : "IA"}
    </span>
  );
}

function datasetKey(dataset) {
  return dataset.replace(/^release_/, "");
}

const FEEDBACK_MS = 2000;

export default function ReleasesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [datasetFiltro, setDatasetFiltro] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const copiedAllTimer = useRef(null);
  const copiedIndexTimer = useRef(null);

  useEffect(() => {
    api
      .get("/insights/releases")
      .then((r) => setReleases(r.data || []))
      .catch((err) => console.error("Erro ao carregar releases:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(copiedAllTimer.current);
      clearTimeout(copiedIndexTimer.current);
    };
  }, []);

  // Backend ordena por dataset (chave técnica) — reordena aqui pelo mais
  // recente primeiro, que é o que faz sentido pra quem está lendo a lista.
  const ordenadas = useMemo(
    () => [...releases].sort((a, b) => new Date(b.gerado_em) - new Date(a.gerado_em)),
    [releases]
  );

  const datasetsPresentes = useMemo(() => {
    const chaves = [...new Set(ordenadas.map((r) => datasetKey(r.dataset)))];
    return chaves.map((key) => ({ key, label: getLabel(key) }));
  }, [ordenadas]);

  const visiveis = datasetFiltro
    ? ordenadas.filter((r) => datasetKey(r.dataset) === datasetFiltro)
    : ordenadas;

  const clipboardDisponivel = typeof navigator !== "undefined" && !!navigator.clipboard;

  const abrirModal = (release) => {
    setCopiedAll(false);
    setCopiedIndex(null);
    setModal(release);
  };

  const fecharModal = () => {
    setCopiedAll(false);
    setCopiedIndex(null);
    setModal(null);
  };

  const handlePrint = (release) => {
    const municipioNome = user?.municipio?.nome || "Município";
    const ok = abrirImpressao(release, municipioNome);
    if (!ok) addToast("Habilite pop-ups para baixar o PDF.", "error");
  };

  const handleCopyAll = async () => {
    if (!modal || !clipboardDisponivel) return;
    await navigator.clipboard.writeText(modal.bullets.join("\n\n"));
    setCopiedAll(true);
    clearTimeout(copiedAllTimer.current);
    copiedAllTimer.current = setTimeout(() => setCopiedAll(false), FEEDBACK_MS);
  };

  const handleCopyParagraph = async (texto, i) => {
    if (!clipboardDisponivel) return;
    await navigator.clipboard.writeText(texto);
    setCopiedIndex(i);
    clearTimeout(copiedIndexTimer.current);
    copiedIndexTimer.current = setTimeout(() => setCopiedIndex(null), FEEDBACK_MS);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
              Releases de Imprensa
            </h1>
          </div>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Comunicados para divulgação institucional, gerados por IA ou por especialista.
          </p>
        </div>

        {!loading && releases.length > 0 && (
          <NidSelect
            value={datasetFiltro}
            onChange={(e) => setDatasetFiltro(e.target.value)}
            ariaLabel="Filtrar por tema"
          >
            <option value="">Todos os temas</option>
            {datasetsPresentes.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </NidSelect>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-[var(--panel)] p-6 rounded-2xl border border-[var(--border)] animate-pulse h-40"
            />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] p-12 text-center">
          <NewspaperIcon className="w-12 h-12 text-[var(--text-mute)] mx-auto mb-4" />
          <p className="text-[var(--text-dim)] text-sm">
            Nenhum release disponível para o seu município.
          </p>
          <p className="text-[var(--text-mute)] text-xs mt-1">
            Os releases são gerados pelo administrador e aparecem aqui quando disponíveis.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visiveis.map((release) => {
            const label = getLabel(release.dataset);
            const route = DATASET_ROUTE[datasetKey(release.dataset)];
            return (
              <div
                key={release.id}
                data-testid={`release-card-${datasetKey(release.dataset)}`}
                className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-6 flex flex-col gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0">
                    <NewspaperIcon className="w-5 h-5 text-[var(--accent-3)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-[var(--text)] text-sm">{label}</h3>
                      <Badge modelo={release.modelo} />
                    </div>
                    <p className="text-xs text-[var(--text-mute)] mt-0.5">
                      {fmtDateRelease(release.gerado_em)}
                      {release.periodo && ` · ${release.periodo}`}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-dim)] line-clamp-3 leading-relaxed">
                  {release.bullets[0]}
                </p>

                {route && (
                  <Link
                    to={route}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-3)] hover:opacity-80 transition-colors -mt-2"
                  >
                    Ver os dados <ArrowRightIcon className="w-3.5 h-3.5" />
                  </Link>
                )}

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => abrirModal(release)}
                    className="flex-1 text-sm font-medium text-[var(--accent-3)] border border-[var(--border)] rounded-xl py-2 hover:bg-[var(--panel-2)] transition-colors"
                  >
                    Visualizar
                  </button>
                  <button
                    onClick={() => handlePrint(release)}
                    className="flex-1 text-sm font-medium text-[var(--bg)] bg-[var(--accent-3)] hover:opacity-90 rounded-xl py-2 transition-colors"
                  >
                    Baixar PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={fecharModal}
          >
            <motion.div
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between p-6 border-b border-[var(--border)]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs uppercase tracking-wider text-[var(--text-mute)] font-semibold">
                      Release de Imprensa
                    </p>
                    <Badge modelo={modal.modelo} />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text)]">
                    {getLabel(modal.dataset)}
                  </h3>
                  <p className="text-xs text-[var(--text-mute)] mt-1">
                    {fmtDateRelease(modal.gerado_em)}
                    {modal.periodo && ` · ${modal.periodo}`}
                  </p>
                  {DATASET_ROUTE[datasetKey(modal.dataset)] && (
                    <Link
                      to={DATASET_ROUTE[datasetKey(modal.dataset)]}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-3)] hover:opacity-80 transition-colors mt-1"
                    >
                      Ver os dados <ArrowRightIcon className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
                <button
                  onClick={fecharModal}
                  className="text-slate-400 hover:text-slate-600  transition-colors ml-4"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {clipboardDisponivel && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyAll}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-dim)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 hover:bg-[var(--panel-2)] transition-colors"
                    >
                      {copiedAll ? (
                        <><CheckIcon className="w-3.5 h-3.5" /> Copiado!</>
                      ) : (
                        <><ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copiar tudo</>
                      )}
                    </button>
                  </div>
                )}
                {modal.bullets.map((paragraph, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <p className="text-sm leading-relaxed text-slate-700  flex-1">
                      {paragraph}
                    </p>
                    {clipboardDisponivel && (
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {copiedIndex === i && (
                          <span className="text-[10px] font-medium text-[var(--accent-5)]">Copiado!</span>
                        )}
                        <button
                          onClick={() => handleCopyParagraph(paragraph, i)}
                          aria-label="Copiar parágrafo"
                          className="p-1 rounded text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors"
                        >
                          {copiedIndex === i ? (
                            <CheckIcon className="w-3.5 h-3.5" />
                          ) : (
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
                <button
                  onClick={fecharModal}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => handlePrint(modal)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-3)] hover:opacity-90 text-[var(--bg)] text-sm font-medium transition-colors"
                >
                  <NewspaperIcon className="w-4 h-4" />
                  Imprimir / Baixar PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
