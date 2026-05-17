import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../services/api";
import { NewspaperIcon, XMarkIcon, PencilSquareIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../../context/AuthContext";

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

const DATASET_LABELS = {
  geral: "Visão Geral",
  arrecadacao: "Arrecadação",
  pib: "PIB",
  caged: "CAGED",
  rais: "RAIS",
  bolsa_familia: "Bolsa Família",
  pe_de_meia: "Pé-de-Meia",
  inss: "INSS",
  estban: "Bancos (Estban)",
  comex: "Comércio Exterior",
  empresas: "Empresas",
  pix: "PIX",
};

function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getLabel(dataset) {
  const key = dataset.replace(/^release_/, "");
  return DATASET_LABELS[key] || key;
}

export default function ReleasesPage() {
  const { user } = useAuth();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    api
      .get("/insights/releases")
      .then((r) => setReleases(r.data || []))
      .catch((err) => console.error("Erro ao carregar releases:", err))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = (release) => {
    const label = getLabel(release.dataset);
    const municipioNome = user?.municipio?.nome || "Município";
    const dataGerado = fmtDate(release.gerado_em);
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
    h1 { font-size: 22pt; font-weight: bold; line-height: 1.2; margin-bottom: 8px; }
    .meta { font-size: 9pt; color: #555; font-style: italic; }
    .body p { margin-bottom: 1.4em; text-align: justify; hyphens: auto; }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
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
          {releases.map((release) => {
            const label = getLabel(release.dataset);
            return (
              <div
                key={release.id}
                className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-6 flex flex-col gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100  flex items-center justify-center flex-shrink-0">
                    <NewspaperIcon className="w-5 h-5 text-violet-600 " />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-[var(--text)] text-sm">{label}</h3>
                      <Badge modelo={release.modelo} />
                    </div>
                    <p className="text-xs text-[var(--text-mute)] mt-0.5">
                      {fmtDate(release.gerado_em)}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-dim)] line-clamp-3 leading-relaxed">
                  {release.bullets[0]}
                </p>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => setModal(release)}
                    className="flex-1 text-sm font-medium text-violet-600  border border-violet-200  rounded-xl py-2 hover:bg-[var(--panel-2)] transition-colors"
                  >
                    Visualizar
                  </button>
                  <button
                    onClick={() => handlePrint(release)}
                    className="flex-1 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl py-2 transition-colors"
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
            onClick={() => setModal(null)}
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
                    {fmtDate(modal.gerado_em)}
                  </p>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="text-slate-400 hover:text-slate-600  transition-colors ml-4"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {modal.bullets.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700 ">
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
                <button
                  onClick={() => setModal(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => handlePrint(modal)}
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
    </motion.div>
  );
}
