import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  BookOpenIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import NidTabBar from "../../components/nid/NidTabBar";
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
import StatusPill from "../../components/nid/StatusPill";
import { diasAtraso, progresso } from "../../utils/projetoStatus";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

// Cycle through accent vars by eixo index
const EIXO_ACCENTS = ["--accent-1", "--accent-2", "--accent-3", "--accent-4", "--accent-5"];

const defaultForm = { eixo_id: "", titulo: "", descricao: "", conteudo: "" };

const STATUS_CONFIG = {
  nao_iniciado: { label: "Não iniciado", kind: "draft" },
  em_andamento: { label: "Em andamento", kind: "warn" },
  concluido:    { label: "Concluído",    kind: "ok" },
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function AcervoTab({ onSelectSuccess }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const [templates, setTemplates] = useState([]);
  const [eixos, setEixos] = useState([]);
  const [imagens, setImagens] = useState([]);
  const [acompanhamentos, setAcompanhamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEixo, setFilterEixo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [viewingTemplate, setViewingTemplate] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingTemplate) { setViewingTemplate(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingTemplate, showForm]));

  async function load() {
    try {
      const [tmplRes, eixosRes, imagensRes] = await Promise.all([
        api.get("/projetos/acervo"),
        api.get("/projetos/eixos"),
        api.get("/projetos/imagens").catch(() => ({ data: [] })),
      ]);
      setTemplates(tmplRes.data || []);
      setEixos(eixosRes.data || []);
      setImagens(imagensRes.data || []);
      if (!isGlobal) {
        const projRes = await api.get("/projetos");
        setAcompanhamentos(projRes.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedTemplateIds = new Set(
    acompanhamentos.filter((p) => p.template_id).map((p) => p.template_id)
  );

  const filteredTemplates = filterEixo
    ? templates.filter((t) => String(t.eixo_id) === filterEixo)
    : templates;

  function eixoLabel(eixo_id) {
    return eixos.find((e) => e.id === eixo_id)?.nome || null;
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      eixo_id: t.eixo_id ? String(t.eixo_id) : "",
      titulo: t.titulo,
      descricao: t.descricao || "",
      conteudo: t.conteudo || "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      ...form,
      eixo_id: form.eixo_id ? Number(form.eixo_id) : null,
    };
    try {
      if (editingId) {
        await api.put(`/projetos/acervo/${editingId}`, payload);
        addToast("Modelo atualizado", "success");
      } else {
        await api.post("/projetos/acervo", payload);
        addToast("Modelo criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/acervo/${id}`);
      setDeleteConfirmId(null);
      addToast("Modelo excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir modelo", "error");
    }
  }

  async function handleSelecionar(template) {
    setSelecting(template.id);
    try {
      await api.post(`/projetos/acervo/${template.id}/selecionar`);
      addToast("Projeto adicionado ao acompanhamento!", "success");
      onSelectSuccess?.();
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao selecionar projeto", "error");
    } finally {
      setSelecting(null);
    }
  }

  // Build eixo tab list: "Todos" + one per eixo with count
  const eixoTabs = [
    { key: "", label: "Todos", count: templates.length },
    ...eixos.map((e, i) => ({
      key: String(e.id),
      label: e.nome,
      count: templates.filter((t) => String(t.eixo_id) === String(e.id)).length,
      accentVar: EIXO_ACCENTS[i % EIXO_ACCENTS.length],
    })),
  ];

  const eixoAccentMap = Object.fromEntries(
    eixos.map((e, i) => [String(e.id), EIXO_ACCENTS[i % EIXO_ACCENTS.length]])
  );

  const imagemById = Object.fromEntries(imagens.map((i) => [String(i.id), i.imagem]));
  const eixoImagemMap = Object.fromEntries(
    eixos.map((e) => [String(e.id), e.imagem_id != null ? imagemById[String(e.imagem_id)] : null])
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Eixo sub-tab bar + add button row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <NidTabBar
          tabs={eixoTabs}
          value={filterEixo}
          onChange={setFilterEixo}
          ariaLabel="Filtrar por eixo"
        />
        {isGlobal && (
          <button
            onClick={openCreate}
            className="proj-add-btn"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Modelo
          </button>
        )}
      </div>

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-dim)" }}>
          <BookOpenIcon style={{ width: 48, height: 48, margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-dim)" }}>Nenhum modelo disponível</p>
          <p style={{ fontSize: 12, marginTop: 4, color: "var(--text-mute)" }}>
            {isGlobal
              ? "Clique em \"Novo Modelo\" para adicionar o primeiro projeto ao acervo."
              : "O administrador ainda não cadastrou projetos no acervo."}
          </p>
        </div>
      )}

      {/* Cards grid */}
      {filteredTemplates.length > 0 && (
        <div className="proj-grid">
          {filteredTemplates.map((t) => {
            const alreadyAdded = selectedTemplateIds.has(t.id);
            const label = eixoLabel(t.eixo_id);
            const accentVar = eixoAccentMap[String(t.eixo_id)] || "--accent-1";
            const coverImg = eixoImagemMap[String(t.eixo_id)];
            return (
              <div key={t.id} className="proj-card">
                {/* Image slot — eixo cover when set, else gradient placeholder */}
                <div
                  className="proj-card__img"
                  style={{ "--proj-accent": `var(${accentVar})`, ...(coverImg ? { padding: 0, overflow: "hidden" } : {}) }}
                >
                  {coverImg ? (
                    <img src={coverImg} alt={label || "capa do projeto"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    "PROJETO · IMAGEM"
                  )}
                </div>

                {/* Header row: eixo tag + admin actions */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {label && (
                      <span
                        className="proj-card__eixo-tag"
                        style={{
                          color: `var(${accentVar})`,
                          background: `color-mix(in oklab, var(${accentVar}) 14%, transparent)`,
                          borderColor: "transparent",
                        }}
                      >
                        {label}
                      </span>
                    )}
                    <h3
                      className="proj-card__title rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      style={{ cursor: "pointer" }}
                      {...propsTituloClicavel(() => setViewingTemplate(t))}
                    >
                      {t.titulo}
                    </h3>
                  </div>
                  {isGlobal && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => openEdit(t)}
                        aria-label="Editar modelo"
                        className="proj-card__icon-btn"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(t.id)}
                        aria-label="Excluir modelo"
                        className="proj-card__icon-btn proj-card__icon-btn--danger"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                {t.descricao && (
                  <p className="proj-card__desc">{t.descricao}</p>
                )}

                {/* Footer */}
                {!isGlobal && (
                  <div className="proj-card__footer">
                    {alreadyAdded ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--accent-5)", fontWeight: 500 }}>
                        <CheckIcon style={{ width: 14, height: 14 }} />
                        Já adicionado ao acompanhamento
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSelecionar(t)}
                        disabled={selecting === t.id}
                        className="proj-card__select-btn"
                      >
                        {selecting === t.id ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Adicionando...</>
                        ) : (
                          "Selecionar projeto"
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Template detail drawer */}
      {(() => {
        const t = viewingTemplate;
        const accentVar = t ? (eixoAccentMap[String(t.eixo_id)] || "--accent-1") : "--accent-1";
        const coverImg = t ? eixoImagemMap[String(t.eixo_id)] : null;
        const vinculado = t && !isGlobal
          ? acompanhamentos.find((p) => p.template_id === t.id)
          : null;
        const st = vinculado ? (STATUS_CONFIG[vinculado.status] || STATUS_CONFIG.nao_iniciado) : null;
        const atraso = vinculado ? diasAtraso(vinculado) : null;
        const prog = vinculado ? progresso(vinculado.tarefas) : null;
        const podeSelecionar = t && !isGlobal && !selectedTemplateIds.has(t.id);
        return (
          <NidDrawer
            open={!!t}
            onClose={() => setViewingTemplate(null)}
            ariaLabel={t ? `Detalhes do projeto ${t.titulo}` : "Detalhes do projeto"}
            hero={t && (
              coverImg ? (
                <img
                  src={coverImg}
                  alt={eixoLabel(t.eixo_id) || "capa do projeto"}
                  style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div
                  className="proj-card__img"
                  style={{ "--proj-accent": `var(${accentVar})`, height: 200, borderRadius: 0, border: "none" }}
                >
                  PROJETO · IMAGEM
                </div>
              )
            )}
            footer={podeSelecionar && (
              <button
                onClick={() => { handleSelecionar(t); setViewingTemplate(null); }}
                disabled={selecting === t.id}
                className="proj-card__select-btn"
                style={{ width: "100%" }}
              >
                Selecionar projeto
              </button>
            )}
          >
            {t && (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  {eixoLabel(t.eixo_id) && (
                    <span
                      className="proj-card__eixo-tag"
                      style={{
                        color: `var(${accentVar})`,
                        background: `color-mix(in oklab, var(${accentVar}) 14%, transparent)`,
                        borderColor: "transparent",
                        marginBottom: 8,
                        display: "inline-block",
                      }}
                    >
                      {eixoLabel(t.eixo_id)}
                    </span>
                  )}
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>{t.titulo}</h2>
                </div>
                {t.descricao && (
                  <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>{t.descricao}</p>
                )}
                {t.conteudo && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <MarkdownLite texto={t.conteudo} />
                  </div>
                )}
                {vinculado && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 10 }}>
                    <p style={{ font: "600 10.5px/1 var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-mute)", margin: 0 }}>
                      Acompanhamento
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <StatusPill kind={st.kind} dot label={st.label} />
                      {atraso !== null && <StatusPill kind="err" dot label={`⚠ Atrasado há ${atraso}d`} />}
                      {vinculado.data_prazo && (
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: atraso !== null ? "var(--accent-2)" : "var(--text-dim)" }}>
                          Prazo: {fmtDate(vinculado.data_prazo)}
                        </span>
                      )}
                    </div>
                    {prog && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                          <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>
                          {prog.feitas}/{prog.total} tarefas · {prog.pct}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </NidDrawer>
        );
      })()}

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="nid-modal-backdrop"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="nid-modal"
              style={{ maxWidth: 380 }}
            >
              <h3 style={{ fontWeight: 700, color: "var(--text)", margin: 0 }}>Excluir modelo?</h3>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Esta ação não pode ser desfeita. Os projetos em acompanhamento derivados deste modelo não serão afetados.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteConfirmId(null)} className="nid-modal__btn-cancel">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="nid-modal__btn-danger">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create / Edit form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="nid-modal-backdrop"
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="nid-modal"
              style={{ maxWidth: 680 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                  {editingId ? "Editar Modelo" : "Novo Modelo de Projeto"}
                </h3>
                <button onClick={closeForm} className="nid-modal__close">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="nid-form-label">Eixo (opcional)</label>
                    <select
                      value={form.eixo_id}
                      onChange={(e) => setForm((p) => ({ ...p, eixo_id: e.target.value }))}
                      className="nid-form-input"
                    >
                      <option value="">Sem eixo</option>
                      {eixos.map((e) => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="nid-form-label">Título *</label>
                    <input
                      value={form.titulo}
                      onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                      required
                      placeholder="Nome do projeto modelo"
                      className="nid-form-input"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Descrição resumida</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    placeholder="Breve descrição do projeto..."
                    className="nid-form-input"
                    style={{ resize: "none" }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Conteúdo detalhado</label>
                  <textarea
                    value={form.conteudo}
                    onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
                    rows={6}
                    placeholder="Detalhes, objetivos, metodologia... Aceita ## títulos, - listas e **negrito**"
                    className="nid-form-input"
                    style={{ resize: "none" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
                  {formError && <p style={{ fontSize: 13, color: "var(--accent-2)", flex: 1 }}>{formError}</p>}
                  <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
                    <button type="button" onClick={closeForm} className="nid-modal__btn-cancel">Cancelar</button>
                    <button type="submit" disabled={saving} className="nid-modal__btn-primary">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Modelo"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
