import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import {
  SparklesIcon,
  ArrowPathIcon,
  NewspaperIcon,
  PencilSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import NidModal, { NidField } from "../../components/nid/NidModal";
import StatusPill from "../../components/nid/StatusPill";
import AdminStats from "../../components/nid/AdminStats";
import AdminSearchInput from "../../components/nid/AdminSearchInput";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import PrioridadesEditorModal from "../../components/PrioridadesEditorModal";

// ─── Dataset registry ──────────────────────────────────────────────────────────
const DATASETS = [
  { key: "geral",        label: "Visão Geral",       desc: "Síntese cruzando todos os dados" },
  { key: "arrecadacao",  label: "Arrecadação",        desc: "Receitas municipais" },
  { key: "pib",          label: "PIB",                desc: "Produto Interno Bruto" },
  { key: "vaf",          label: "VAF",                desc: "Valor Adicionado Fiscal / IPM" },
  { key: "caged",        label: "CAGED",              desc: "Mercado formal de trabalho" },
  { key: "rais",         label: "RAIS",               desc: "Relação anual de informações sociais" },
  { key: "bolsa_familia",label: "Bolsa Família",      desc: "Programa de transferência de renda" },
  { key: "pe_de_meia",   label: "Pé-de-Meia",         desc: "Programa de poupança estudantil" },
  { key: "inss",         label: "INSS",               desc: "Benefícios previdenciários" },
  { key: "estban",       label: "Bancos (Estban)",    desc: "Estatísticas bancárias municipais" },
  { key: "comex",        label: "Comércio Exterior",  desc: "Exportações e importações" },
  { key: "empresas",     label: "Empresas",           desc: "Cadastro empresarial" },
  { key: "pix",          label: "PIX",                desc: "Pagamentos instantâneos" },
];

const STALE_DAYS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(dt) {
  if (!dt) return "—";
  const diff = Date.now() - new Date(dt).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function isStale(dt) {
  if (!dt) return false;
  const diff = Date.now() - new Date(dt).getTime();
  return diff > STALE_DAYS * 86_400_000;
}

function computeStatus(insight) {
  if (!insight) return "never";
  if (!insight.ativo) return "hidden";
  const bullets = insight.bullets || [];
  if (bullets.length === 0) return "failed";
  if (isStale(insight.gerado_em)) return "stale";
  return "published";
}

function pillProps(status) {
  switch (status) {
    case "never":     return { kind: "draft", label: "Nunca gerado" };
    case "hidden":    return { kind: "draft", label: "Oculto" };
    case "failed":    return { kind: "err",   label: "Falha" };
    case "stale":     return { kind: "draft", label: "Desatualizado" };
    case "published": return { kind: "ok",    label: "Publicado" };
    default:          return { kind: "info",  label: status };
  }
}

// ─── InsightCard ─────────────────────────────────────────────────────────────
function InsightCard({
  dataset,        // { key, label, desc }
  insight,        // raw insight row or undefined
  release,        // raw release row or undefined
  isGenerating,
  isGeneratingRelease,
  isActing,
  onGerar,
  onRegerar,
  onToggleAtivo,
  onTogglePlanoFree,
  onDelete,
  onGerarRelease,
  onInserirManual,
  onViewRelease,
}) {
  const status   = computeStatus(insight);
  const pill     = pillProps(status);
  const isNarrative = dataset.key === "geral";

  const bullets  = insight?.bullets || [];
  const hiddenFromFree = insight?.oculto_planos?.includes("free");

  // Stamp line
  let stampText = "";
  if (status === "never")     stampText = "Nunca gerado para este município";
  else if (status === "hidden") stampText = `Oculto · gerado ${fmtRelative(insight.gerado_em)}`;
  else if (status === "failed") stampText = "Falha ao gerar — verifique o log";
  else if (status === "stale")  stampText = `Desatualizado · gerado ${fmtDate(insight?.gerado_em)}`;
  else                          stampText = `Gerado ${fmtDate(insight?.gerado_em)} · ${insight?.modelo || ""}`;

  const cardClass = [
    "nid-icard",
    `nid-icard--${status}`,
    isNarrative ? "nid-icard--narrative" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={cardClass}>
      {/* Head */}
      <header className="nid-icard__head">
        <div>
          <div className="nid-icard__name">{dataset.label}</div>
          <div className="nid-icard__sub">{dataset.key} · {dataset.desc}</div>
        </div>
        <StatusPill kind={pill.kind} label={pill.label} dot />
      </header>

      {/* Bullets (published / stale) */}
      {bullets.length > 0 && (
        <ul className="nid-icard__bullets">
          {bullets.slice(0, 3).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {/* Stamp */}
      <p className="nid-icard__stamp">{stampText}</p>

      {/* Footer actions */}
      <footer className="nid-icard__footer">
        {/* ── never ── */}
        {status === "never" && (
          <button
            className="primary"
            onClick={() => onGerar(dataset.key)}
            disabled={isGenerating}
          >
            <SparklesIcon style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} />
            {isGenerating ? "Gerando..." : "Gerar inicial"}
          </button>
        )}

        {/* ── published ── */}
        {status === "published" && (
          <>
            <button
              onClick={() => onRegerar(dataset.key)}
              disabled={isGenerating}
            >
              <ArrowPathIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              {isGenerating ? "Gerando..." : "Regenerar"}
            </button>
            <button
              onClick={() => onToggleAtivo(insight)}
              disabled={isActing}
              title="Ocultar para todos"
            >
              <EyeSlashIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              Ocultar
            </button>
            <button
              className="ghost"
              onClick={() => onTogglePlanoFree(insight)}
              disabled={isActing}
              title={hiddenFromFree ? "Visível para free" : "Ocultar para free"}
            >
              {hiddenFromFree
                ? <><EyeIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />Free: oculto</>
                : <><EyeSlashIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />Free: visível</>
              }
            </button>
            <button
              className="danger"
              onClick={() => onDelete(insight)}
              disabled={isActing}
            >
              Excluir
            </button>
            <button
              className="ghost"
              onClick={() => onInserirManual(dataset)}
            >
              <PencilSquareIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              Inserir manual
            </button>
            <button
              className="ghost"
              onClick={() => onGerarRelease(dataset.key)}
              disabled={isGeneratingRelease}
            >
              <NewspaperIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              {isGeneratingRelease ? "Gerando..." : release ? "Regen. release" : "Gerar release"}
            </button>
            {release && (
              <button
                className="ghost"
                onClick={() => onViewRelease(dataset, release)}
              >
                Ver release
              </button>
            )}
          </>
        )}

        {/* ── hidden ── */}
        {status === "hidden" && (
          <>
            <button
              className="primary"
              onClick={() => onToggleAtivo(insight)}
              disabled={isActing}
            >
              <EyeIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              {isActing ? "..." : "Mostrar"}
            </button>
            <button
              className="danger"
              onClick={() => onDelete(insight)}
              disabled={isActing}
            >
              Excluir
            </button>
          </>
        )}

        {/* ── stale ── */}
        {status === "stale" && (
          <>
            <button
              className="primary"
              onClick={() => onRegerar(dataset.key)}
              disabled={isGenerating}
            >
              <ArrowPathIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              {isGenerating ? "Gerando..." : "Regenerar"}
            </button>
            {release && (
              <button
                className="ghost"
                onClick={() => onViewRelease(dataset, release)}
              >
                Ver atual
              </button>
            )}
          </>
        )}

        {/* ── failed ── */}
        {status === "failed" && (
          <>
            <button
              className="primary"
              onClick={() => onRegerar(dataset.key)}
              disabled={isGenerating}
            >
              <ArrowPathIcon style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
              {isGenerating ? "Gerando..." : "Tentar novamente"}
            </button>
            <button
              className="ghost"
              onClick={() => onDelete(insight)}
              disabled={isActing}
            >
              Ver log
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InsightsAdminPage() {
  const [municipios, setMunicipios]               = useState([]);
  const [selectedId, setSelectedId]               = useState("");
  const [insights,   setInsights]                 = useState({});
  const [releases,   setReleases]                 = useState({});
  const [loadingInsights, setLoadingInsights]     = useState(false);
  const [generating,        setGenerating]        = useState({});
  const [generatingRelease, setGeneratingRelease] = useState({});
  const [generatingAll,     setGeneratingAll]     = useState(false);
  const [acting,            setActing]            = useState({});
  const [releaseModal,      setReleaseModal]      = useState(null);
  const [manualModal,       setManualModal]       = useState(null);
  const [manualText,        setManualText]        = useState("");
  const [submittingManual,  setSubmittingManual]  = useState(false);
  const [prioridades,       setPrioridades]       = useState(null);
  const [generatingPrioridades, setGeneratingPrioridades] = useState(false);
  const [editandoPrioridades, setEditandoPrioridades] = useState(false);
  const [search,            setSearch]            = useState("");

  // Dataset list filtered by search (matches key / label / desc)
  const visibleDatasets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DATASETS;
    return DATASETS.filter((d) =>
      d.key.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      (d.desc || "").toLowerCase().includes(q)
    );
  }, [search]);

  // Load municipality list once
  useEffect(() => {
    api.get("/municipios").then((r) => setMunicipios(r.data || []));
  }, []);

  const loadInsights = (id) => {
    setLoadingInsights(true);
    setInsights({});
    setReleases({});
    setPrioridades(null);
    Promise.all([
      api.get("/insights/admin", { params: { municipio_id: id } }),
      api.get("/insights/admin_releases", { params: { municipio_id: id } }),
      api.get("/insights/prioridades", { params: { municipio_id: id } }).catch((err) => {
        if (err.response?.status === 404) return { data: null };
        throw err;
      }),
    ])
      .then(([insRes, relRes, priRes]) => {
        const map = {};
        (insRes.data || []).forEach((ins) => { map[ins.dataset] = ins; });
        setInsights(map);

        const relMap = {};
        (relRes.data || []).forEach((ins) => {
          const baseKey = ins.dataset.replace(/^release_/, "");
          relMap[baseKey] = ins;
        });
        setReleases(relMap);

        setPrioridades(priRes.data);
      })
      .catch(() => { setInsights({}); setReleases({}); setPrioridades(null); })
      .finally(() => setLoadingInsights(false));
  };

  useEffect(() => {
    if (!selectedId) return;
    loadInsights(selectedId);
  }, [selectedId]);

  // ── Handlers ────────────────────────────────────────────────────────────────
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

  const handleGerarPrioridades = async () => {
    if (
      prioridades?.modelo === "especialista" &&
      prioridades?.periodo === new Date().toISOString().slice(0, 7) &&
      !confirm("Há edição manual deste mês — regenerar substitui o conteúdo pela versão de IA. Continuar?")
    ) return;
    setGeneratingPrioridades(true);
    try {
      const res = await api.post("/insights/prioridades/gerar", {
        municipio_id: parseInt(selectedId),
      });
      setPrioridades(res.data);
    } catch (err) {
      console.error("Erro ao gerar prioridades:", err.response?.data?.detail || err.message);
    } finally {
      setGeneratingPrioridades(false);
    }
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
      font-size: 12pt; line-height: 1.8;
      color: #1a1a1a; background: white;
      max-width: 720px; margin: 0 auto; padding: 48px 40px;
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

  // ── Derived values ──────────────────────────────────────────────────────────
  const municipioNome = municipios.find((m) => m.id === parseInt(selectedId))?.nome || "Município";

  const withInsights    = DATASETS.filter((d) => !!insights[d.key]).length;
  const withoutInsights = DATASETS.length - withInsights;
  const mostRecent      = DATASETS.map((d) => insights[d.key]?.gerado_em).filter(Boolean).sort().reverse()[0];

  const statsItems = [
    { label: "Datasets cobertos",    value: `${withInsights} / ${DATASETS.length}` },
    { label: "Sem insight",          value: withoutInsights },
    { label: "Última geração",       value: mostRecent ? fmtRelative(mostRecent) : "—" },
    { label: "Próxima geração auto", value: "—" },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            Insights IA{selectedId ? ` — ${municipioNome}` : ""}
          </h1>
          <p style={{ color: "var(--text-mute)", fontSize: 13, marginTop: 4 }}>
            Gere insights, releases de imprensa e gerencie visibilidade por município.
            {search && visibleDatasets.length !== DATASETS.length &&
              ` · ${visibleDatasets.length} dataset${visibleDatasets.length !== 1 ? "s" : ""} para "${search}"`}
          </p>
        </div>
        {selectedId && (
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar dataset…"
            ariaLabel="Buscar datasets"
          />
        )}
      </div>

      {/* Municipality selector */}
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "18px 20px",
        }}
      >
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--text-mute)",
            marginBottom: 8,
          }}
        >
          Município
        </label>
        <MunicipioPicker
          municipios={municipios}
          value={selectedId}
          onChange={setSelectedId}
          ariaLabel="Selecionar município para gerenciar insights"
        />
      </div>

      {/* AdminStats strip — only when a município is selected */}
      {selectedId && !loadingInsights && (
        <AdminStats items={statsItems} />
      )}

      {/* Prioridades do mês */}
      {selectedId && (
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                Prioridades do mês
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-mute)", marginTop: 4 }}>
                Top 3 observações cruzando todos os datasets — renderizado no topo do Dashboard Geral.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setEditandoPrioridades(true)}
                disabled={loadingInsights}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: "var(--admin-accent)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  opacity: loadingInsights ? 0.45 : 1,
                }}
              >
                <PencilIcon style={{ width: 14, height: 14 }} />
                Editar
              </button>
              <button
                onClick={handleGerarPrioridades}
                disabled={generatingPrioridades || loadingInsights}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                  color: "var(--admin-accent)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  opacity: (generatingPrioridades || loadingInsights) ? 0.45 : 1,
                }}
              >
                <ArrowPathIcon style={{ width: 14, height: 14 }} className={generatingPrioridades ? "animate-spin" : ""} />
                {generatingPrioridades ? "Gerando..." : prioridades ? "Regenerar" : "Gerar"}
              </button>
            </div>
          </div>
          {prioridades ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-mute)", marginTop: 10 }}>
              Última geração: {fmtDate(prioridades.gerado_em)} · período {prioridades.periodo} · {prioridades.prioridades.length} prioridade(s)
            </div>
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-mute)", marginTop: 10 }}>
              Ainda não gerado para este município.
            </div>
          )}
          <PrioridadesEditorModal
            aberto={editandoPrioridades}
            onClose={() => setEditandoPrioridades(false)}
            inicial={prioridades}
            municipioId={parseInt(selectedId)}
            onSaved={(d) => setPrioridades(d)}
          />
        </div>
      )}

      {/* Dataset card grid */}
      {selectedId && (
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {/* Section header with Gerar Todos */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
              Datasets
            </span>
            <button
              onClick={handleGerarTodos}
              disabled={generatingAll || loadingInsights}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "var(--admin-accent)", color: "#fff",
                border: "none", borderRadius: 9, padding: "8px 14px",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                cursor: "pointer",
                opacity: (generatingAll || loadingInsights) ? 0.5 : 1,
              }}
            >
              <SparklesIcon style={{ width: 15, height: 15 }} className={generatingAll ? "animate-pulse" : ""} />
              {generatingAll ? "Gerando todos..." : "Gerar Todos"}
            </button>
          </div>

          <div style={{ padding: "14px 16px" }}>
            {loadingInsights ? (
              <div className="nid-icards">
                {DATASETS.map((d) => (
                  <div
                    key={d.key}
                    style={{
                      height: 160,
                      background: "var(--panel-2)",
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                ))}
              </div>
            ) : visibleDatasets.length === 0 ? (
              <div style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--text-mute)",
                fontFamily: "var(--font-display)",
                fontSize: 13,
              }}>
                Nenhum dataset encontrado para "{search}".
              </div>
            ) : (
              <div className="nid-icards">
                {visibleDatasets.map((d) => {
                  const insight = insights[d.key] || null;
                  const release = releases[d.key] || null;
                  const isActing = insight && acting[insight.id];

                  return (
                    <InsightCard
                      key={d.key}
                      dataset={d}
                      insight={insight}
                      release={release}
                      isGenerating={!!generating[d.key]}
                      isGeneratingRelease={!!generatingRelease[d.key]}
                      isActing={!!isActing}
                      onGerar={handleGerar}
                      onRegerar={handleGerar}
                      onToggleAtivo={handleToggleAtivo}
                      onTogglePlanoFree={handleTogglePlanoFree}
                      onDelete={handleDelete}
                      onGerarRelease={handleGerarRelease}
                      onInserirManual={(ds) => { setManualModal(ds); setManualText(""); }}
                      onViewRelease={(ds, rel) => setReleaseModal({ dataset: ds.key, label: ds.label, release: rel })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Release preview modal ─────────────────────────────────────────── */}
      <NidModal
        open={!!releaseModal}
        onClose={() => setReleaseModal(null)}
        eyebrow="Release de Imprensa"
        title={releaseModal ? `${releaseModal.label} — ${municipioNome}` : ""}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setReleaseModal(null)}
              style={{ borderColor: "var(--border)", color: "var(--text-dim)", background: "transparent" }}
              className="px-4 py-2 rounded-xl border text-sm font-medium transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={() => handlePrintRelease(releaseModal.release, releaseModal.label, municipioNome)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "var(--admin-accent)", color: "#fff" }}
            >
              <NewspaperIcon className="w-4 h-4" />
              Imprimir / Baixar PDF
            </button>
          </>
        }
      >
        {releaseModal && (
          <>
            <p className="text-xs mb-4" style={{ color: "var(--text-mute)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              Gerado em {fmtDate(releaseModal.release.gerado_em)}
            </p>
            <div className="space-y-4">
              {releaseModal.release.bullets.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        )}
      </NidModal>

      {/* ── Manual release insertion modal ───────────────────────────────── */}
      <NidModal
        open={!!manualModal}
        onClose={() => setManualModal(null)}
        eyebrow="Especialista"
        title={manualModal ? `Inserir Release Manual — ${manualModal.label}` : ""}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setManualModal(null)}
              className="px-4 py-2 rounded-xl border text-sm font-medium transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)", background: "transparent" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleInserirManual}
              disabled={submittingManual || !manualText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: "var(--accent-5)", color: "#0a0a0c" }}
            >
              <PencilSquareIcon className="w-4 h-4" />
              {submittingManual ? "Salvando..." : "Inserir Release"}
            </button>
          </>
        }
      >
        {manualModal && (
          <>
            <p className="text-xs mb-4" style={{ color: "var(--text-mute)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              {municipioNome} · Separe os parágrafos com uma linha em branco.
            </p>
            <NidField label="Texto do Release">
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={10}
                placeholder={"Parágrafo 1...\n\nParágrafo 2...\n\nParágrafo 3..."}
              />
            </NidField>
          </>
        )}
      </NidModal>
    </motion.div>
  );
}
