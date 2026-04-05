import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../services/api";
import { NewspaperIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";

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
  if (!dt) return "";
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ReleasesPanel({ dataset }) {
  const { user } = useAuth();
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    api
      .get("/insights/releases")
      .then((r) => {
        const found = (r.data || []).find((rel) => rel.dataset === `release_${dataset}`);
        setRelease(found || null);
      })
      .catch(() => setRelease(null))
      .finally(() => setLoading(false));
  }, [dataset]);

  const handlePrint = () => {
    const label = DATASET_LABELS[dataset] || dataset;
    const municipioNome = user?.municipio?.nome || "Município";
    const dataGerado = release
      ? new Date(release.gerado_em).toLocaleDateString("pt-BR", {
          day: "2-digit", month: "long", year: "numeric",
        })
      : "";
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
    header { border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 28px; }
    .tag { font-size: 8.5pt; font-weight: bold; letter-spacing: .12em; text-transform: uppercase; color: #666; margin-bottom: 8px; }
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

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <NewspaperIcon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-200">Release de Imprensa</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-amber-200 dark:bg-amber-800 rounded animate-pulse" style={{ width: `${85 - i * 10}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!release) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <NewspaperIcon className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-slate-200">Release de Imprensa</h3>
          </div>
          <button
            onClick={handlePrint}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            Baixar PDF
          </button>
        </div>

        <AnimatePresence initial={false}>
          <div className="space-y-2.5">
            {(expanded ? release.bullets : release.bullets.slice(0, 1)).map((paragraph, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed"
              >
                {paragraph}
              </motion.p>
            ))}
          </div>
        </AnimatePresence>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Gerado em {fmtDate(release.gerado_em)}
          </p>
          {release.bullets.length > 1 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            >
              {expanded ? (
                <><ChevronUpIcon className="w-3.5 h-3.5" /> Mostrar menos</>
              ) : (
                <><ChevronDownIcon className="w-3.5 h-3.5" /> Ver release completo</>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
