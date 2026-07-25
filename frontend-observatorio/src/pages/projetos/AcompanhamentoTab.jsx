import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ViewColumnsIcon,
  TableCellsIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  UserIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";
import NidTabBar from "../../components/nid/NidTabBar";
import StatusPill from "../../components/nid/StatusPill";
import ChecklistProjeto from "./ChecklistProjeto";
import { diasAtraso, progresso } from "../../utils/projetoStatus";
import KanbanDndContext from "../../components/kanban/KanbanDndContext";
import DraggableCard from "../../components/kanban/DraggableCard";
import DroppableColumn from "../../components/kanban/DroppableColumn";
import { aplicarMovimento } from "../../utils/kanbanMove";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

// Map backend status → StatusPill kind + display label
const STATUS_CONFIG = {
  nao_iniciado: { label: "Não iniciado", kind: "draft", dot: "var(--text-mute)" },
  em_andamento: { label: "Em andamento", kind: "warn",  dot: "var(--accent-4)" },
  concluido:    { label: "Concluído",    kind: "ok",    dot: "var(--accent-5)" },
};

// Cycle accent vars for eixo coloring
const EIXO_ACCENTS = ["--accent-1", "--accent-2", "--accent-3", "--accent-4", "--accent-5"];

const defaultForm = {
  eixo_id: "",
  titulo: "",
  descricao: "",
  status: "nao_iniciado",
  data_inicio: "",
  data_prazo: "",
  departamento: "",
  responsavel: "",
  conteudo: "",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

function renderOverlayProjeto(projeto) {
  const st = STATUS_CONFIG[projeto.status] || STATUS_CONFIG.nao_iniciado;
  return (
    <div className="proj-card" style={{ width: 280 }}>
      <h3 className="proj-card__title" style={{ margin: 0 }}>{projeto.titulo}</h3>
      <StatusPill kind={st.kind} dot label={st.label} />
    </div>
  );
}

export default function AcompanhamentoTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  // ADMIN_GLOBAL não cria aqui: o projeto nasce no município do usuário.
  const canCriar = usePermissao("projetos", "criar") && !isGlobal;
  const canEditar = usePermissao("projetos", "editar");
  const canExcluir = usePermissao("projetos", "excluir");

  const [projetos, setProjetos] = useState([]);
  const [eixos, setEixos] = useState([]);
  const [imagens, setImagens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("kanban");
  const [filterEixo, setFilterEixo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [viewingProjeto, setViewingProjeto] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingProjeto) { setViewingProjeto(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingProjeto, showForm]));

  async function load() {
    try {
      const [projRes, eixosRes, imagensRes] = await Promise.all([
        api.get("/projetos"),
        api.get("/projetos/eixos"),
        api.get("/projetos/imagens").catch(() => ({ data: [] })),
      ]);
      setProjetos(projRes.data || []);
      setEixos(eixosRes.data || []);
      setImagens(imagensRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    if (!filterEixo) return projetos;
    return projetos.filter((p) => String(p.eixo_id) === filterEixo);
  }, [projetos, filterEixo]);

  const kpis = useMemo(() => ({
    total: projetos.length,
    nao_iniciado: projetos.filter((p) => p.status === "nao_iniciado").length,
    em_andamento: projetos.filter((p) => p.status === "em_andamento").length,
    concluido: projetos.filter((p) => p.status === "concluido").length,
    atrasados: projetos.filter((p) => diasAtraso(p) !== null).length,
  }), [projetos]);

  function eixoLabel(eixo_id) {
    return eixos.find((e) => e.id === eixo_id)?.nome || null;
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditingId(p.id);
    setForm({
      eixo_id: String(p.eixo_id),
      titulo: p.titulo,
      descricao: p.descricao || "",
      status: p.status,
      data_inicio: p.data_inicio || "",
      data_prazo: p.data_prazo || "",
      departamento: p.departamento || "",
      responsavel: p.responsavel || "",
      conteudo: p.conteudo || "",
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
      eixo_id: Number(form.eixo_id),
      data_inicio: form.data_inicio || null,
      data_prazo: form.data_prazo || null,
    };
    try {
      if (editingId) {
        await api.put(`/projetos/${editingId}`, payload);
        addToast("Projeto atualizado", "success");
      } else {
        await api.post("/projetos", payload);
        addToast("Projeto criado com sucesso", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar projeto.");
    } finally {
      setSaving(false);
    }
  }

  async function moverCard(id, novoStatus) {
    const anterior = projetos;
    const otimista = aplicarMovimento(projetos, id, "status", novoStatus);
    if (otimista === anterior) return;
    setProjetos(otimista);
    try {
      await api.put(`/projetos/${id}`, { status: novoStatus });
      addToast("Status atualizado", "success");
      await load();
    } catch (err) {
      setProjetos(anterior);
      addToast(err?.response?.data?.detail || "Erro ao atualizar status", "error");
    }
  }

  function handleTarefasChange(projetoId, tarefas) {
    setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, tarefas } : p)));
    setViewingProjeto((prev) => (prev && prev.id === projetoId ? { ...prev, tarefas } : prev));
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projetos/${id}`);
      setDeleteConfirmId(null);
      addToast("Projeto excluído", "success");
      await load();
    } catch {
      addToast("Erro ao excluir projeto", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isGlobal) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-dim)" }}>
        <InformationCircleIcon style={{ width: 48, height: 48, margin: "0 auto 12px", opacity: 0.3 }} />
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-dim)" }}>O acompanhamento de projetos é específico por município.</p>
        <p style={{ fontSize: 12, marginTop: 4, color: "var(--text-mute)" }}>Faça login com uma conta de município para ver e gerenciar os projetos em andamento.</p>
      </div>
    );
  }

  // Eixo accent map by index
  const eixoAccentMap = Object.fromEntries(
    eixos.map((e, i) => [String(e.id), EIXO_ACCENTS[i % EIXO_ACCENTS.length]])
  );

  // Eixo cover image (preset chosen by admin) → base64
  const imagemById = Object.fromEntries(imagens.map((i) => [String(i.id), i.imagem]));
  const eixoImagemMap = Object.fromEntries(
    eixos.map((e) => [String(e.id), e.imagem_id != null ? imagemById[String(e.imagem_id)] : null])
  );

  // Eixo sub-tabs for filtering
  const eixoTabs = [
    { key: "", label: "Todos", count: projetos.length },
    ...eixos.map((e, i) => ({
      key: String(e.id),
      label: e.nome,
      count: projetos.filter((p) => String(p.eixo_id) === String(e.id)).length,
    })),
  ];

  function ProjetoCard({ projeto }) {
    const st = STATUS_CONFIG[projeto.status] || STATUS_CONFIG.nao_iniciado;
    const label = eixoLabel(projeto.eixo_id);
    const accentVar = eixoAccentMap[String(projeto.eixo_id)] || "--accent-1";
    const coverImg = eixoImagemMap[String(projeto.eixo_id)];
    const atraso = diasAtraso(projeto);
    const prog = progresso(projeto.tarefas);
    return (
      <div className="proj-card">
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

        {/* Header: eixo tag + actions */}
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
              {...propsTituloClicavel(() => setViewingProjeto(projeto))}
            >
              {projeto.titulo}
            </h3>
          </div>
          {(canEditar || canExcluir) && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {canEditar && (
                <button onClick={() => openEdit(projeto)} aria-label="Editar" className="proj-card__icon-btn">
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {canExcluir && (
                <button onClick={() => setDeleteConfirmId(projeto.id)} aria-label="Excluir" className="proj-card__icon-btn proj-card__icon-btn--danger">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Meta info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-mute)" }}>
          {projeto.departamento && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <BuildingOfficeIcon style={{ width: 12, height: 12 }} /> {projeto.departamento}
            </span>
          )}
          {projeto.responsavel && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <UserIcon style={{ width: 12, height: 12 }} /> {projeto.responsavel}
            </span>
          )}
          {projeto.data_prazo && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <CalendarDaysIcon style={{ width: 12, height: 12 }} /> Prazo: {fmtDate(projeto.data_prazo)}
              {atraso !== null && <StatusPill kind="err" dot label={`Atrasado há ${atraso}d`} />}
            </span>
          )}
        </div>

        {prog && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
              <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-mute)", flexShrink: 0 }}>
              {prog.feitas}/{prog.total}
            </span>
          </div>
        )}

        {/* Footer: StatusPill + optional status change dropdown */}
        <div className="proj-card__footer" style={{ flexDirection: "column", gap: 8 }}>
          <StatusPill kind={st.kind} dot label={st.label} />
          {canEditar && (
            <select
              value={projeto.status}
              onChange={(e) => moverCard(projeto.id, e.target.value)}
              className="nid-form-input"
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total", value: kpis.total, accent: "var(--text)" },
          { label: "Não iniciados", value: kpis.nao_iniciado, accent: "var(--text-dim)" },
          { label: "Em andamento", value: kpis.em_andamento, accent: "var(--accent-4)" },
          { label: "Concluídos", value: kpis.concluido, accent: "var(--accent-5)" },
          { label: "Atrasados", value: kpis.atrasados, accent: "var(--accent-2)" },
        ].map((k) => (
          <div key={k.label} className="nid-kpi">
            <p className="nid-kpi-label">{k.label}</p>
            <p className="nid-kpi-value" style={{ color: k.accent, fontSize: 28 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Eixo sub-tabs + view toggle + add button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <NidTabBar
            tabs={eixoTabs}
            value={filterEixo}
            onChange={setFilterEixo}
            ariaLabel="Filtrar por eixo"
          />
          {/* View toggle */}
          <div className="nid-tabbar" style={{ display: "inline-flex" }}>
            <button
              onClick={() => setViewMode("kanban")}
              aria-label="Kanban"
              aria-pressed={viewMode === "kanban"}
              className={`nid-tabbar__tab ${viewMode === "kanban" ? "is-active" : ""}`}
              style={{ padding: "6px 10px" }}
            >
              <ViewColumnsIcon style={{ width: 15, height: 15 }} />
            </button>
            <button
              onClick={() => setViewMode("table")}
              aria-label="Tabela"
              aria-pressed={viewMode === "table"}
              className={`nid-tabbar__tab ${viewMode === "table" ? "is-active" : ""}`}
              style={{ padding: "6px 10px" }}
            >
              <TableCellsIcon style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
        {canCriar && (
          <button onClick={openCreate} className="proj-add-btn">
            <PlusIcon className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>

      {/* Kanban view */}
      {viewMode === "kanban" && (
        <>
          {filtrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-dim)" }}>
              <ViewColumnsIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Nenhum projeto em acompanhamento.</p>
              <p style={{ fontSize: 12, marginTop: 4, color: "var(--text-mute)" }}>Selecione projetos do Acervo ou crie um novo diretamente.</p>
            </div>
          ) : (
            <KanbanDndContext items={projetos} campo="status" onMove={moverCard} renderOverlay={renderOverlayProjeto}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                  const cols = filtrados.filter((p) => p.status === status);
                  return (
                    <div key={status} className="space-y-3">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
                        <h3 style={{ fontWeight: 600, color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{cfg.label}</h3>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-mute)", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 999 }}>{cols.length}</span>
                      </div>
                      <DroppableColumn id={status} disabled={!canEditar} className="space-y-3" style={{ minHeight: 80 }}>
                        {cols.map((p) => (
                          <DraggableCard key={p.id} id={p.id} disabled={!canEditar}>
                            <ProjetoCard projeto={p} />
                          </DraggableCard>
                        ))}
                        {cols.length === 0 && (
                          <div style={{ height: 80, border: "2px dashed var(--border)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-mute)" }}>
                            Vazio
                          </div>
                        )}
                      </DroppableColumn>
                    </div>
                  );
                })}
              </div>
            </KanbanDndContext>
          )}
        </>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div className="nid-panel" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--panel-2)", fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--text-mute)", letterSpacing: "0.1em", textAlign: "left" }}>
                <th style={{ padding: "10px 20px" }}>Título</th>
                <th style={{ padding: "10px 20px" }}>Eixo</th>
                <th style={{ padding: "10px 20px" }}>Status</th>
                <th style={{ padding: "10px 20px" }}>Responsável</th>
                <th style={{ padding: "10px 20px" }}>Prazo</th>
                {(canEditar || canExcluir) && <th style={{ padding: "10px 20px" }} />}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5 + ((canEditar || canExcluir) ? 1 : 0)} style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                    Nenhum projeto em acompanhamento.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => {
                  const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.nao_iniciado;
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td
                        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        style={{ padding: "10px 20px", fontWeight: 500, color: "var(--text)", cursor: "pointer" }}
                        {...propsTituloClicavel(() => setViewingProjeto(p))}
                      >
                        {p.titulo}
                      </td>
                      <td style={{ padding: "10px 20px", color: "var(--text-dim)", fontSize: 11 }}>{eixoLabel(p.eixo_id) || "—"}</td>
                      <td style={{ padding: "10px 20px" }}>
                        <StatusPill kind={st.kind} dot label={st.label} />
                      </td>
                      <td style={{ padding: "10px 20px", color: "var(--text-dim)" }}>{p.responsavel || "—"}</td>
                      <td style={{ padding: "10px 20px", color: diasAtraso(p) !== null ? "var(--accent-2)" : "var(--text-mute)", fontSize: 11 }}>
                        {fmtDate(p.data_prazo) || "—"}
                        {diasAtraso(p) !== null && " · atrasado"}
                      </td>
                      {(canEditar || canExcluir) && (
                        <td style={{ padding: "10px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            {canEditar && (
                              <button onClick={() => openEdit(p)} aria-label="Editar" className="proj-card__icon-btn">
                                <PencilIcon className="w-4 h-4" />
                              </button>
                            )}
                            {canExcluir && (
                              <button onClick={() => setDeleteConfirmId(p.id)} aria-label="Excluir" className="proj-card__icon-btn proj-card__icon-btn--danger">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Project detail modal */}
      <AnimatePresence>
        {viewingProjeto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="nid-modal-backdrop"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingProjeto(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="nid-modal"
              style={{ maxWidth: 680 }}
            >
              {(() => {
                const st = STATUS_CONFIG[viewingProjeto.status] || STATUS_CONFIG.nao_iniciado;
                const atraso = diasAtraso(viewingProjeto);
                const prog = progresso(viewingProjeto.tarefas);
                return (
                  <>
                    {/* Cabeçalho: pills + título + progresso */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <StatusPill kind={st.kind} dot label={st.label} />
                          {atraso !== null && <StatusPill kind="err" dot label={`⚠ Atrasado há ${atraso}d`} />}
                        </div>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "8px 0 0" }}>{viewingProjeto.titulo}</h2>
                        {prog && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                              <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
                            </div>
                            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>
                              {prog.feitas}/{prog.total} tarefas · {prog.pct}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => setViewingProjeto(null)} className="nid-modal__close">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Metadados */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {eixoLabel(viewingProjeto.eixo_id) && <span><span style={{ fontWeight: 600 }}>Eixo:</span> {eixoLabel(viewingProjeto.eixo_id)}</span>}
                      {viewingProjeto.departamento && <span><span style={{ fontWeight: 600 }}>Departamento:</span> {viewingProjeto.departamento}</span>}
                      {viewingProjeto.responsavel && <span><span style={{ fontWeight: 600 }}>Responsável:</span> {viewingProjeto.responsavel}</span>}
                      {viewingProjeto.data_inicio && <span><span style={{ fontWeight: 600 }}>Início:</span> {fmtDate(viewingProjeto.data_inicio)}</span>}
                      {viewingProjeto.data_prazo && (
                        <span style={{ color: atraso !== null ? "var(--accent-2)" : undefined }}>
                          <span style={{ fontWeight: 600 }}>Prazo:</span> {fmtDate(viewingProjeto.data_prazo)}
                        </span>
                      )}
                    </div>

                    {/* Descrição */}
                    {viewingProjeto.descricao && (
                      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>{viewingProjeto.descricao}</p>
                    )}

                    {/* Checklist */}
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <ChecklistProjeto
                        projeto={viewingProjeto}
                        canEditar={canEditar}
                        onChange={(tarefas) => handleTarefasChange(viewingProjeto.id, tarefas)}
                      />
                    </div>

                    {/* Notas */}
                    {viewingProjeto.conteudo && (
                      <div style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "pre-line", borderTop: "1px solid var(--border)", paddingTop: 12, lineHeight: 1.6 }}>
                        <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", margin: "0 0 6px" }}>Notas</p>
                        {viewingProjeto.conteudo}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
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
              <h3 style={{ fontWeight: 700, color: "var(--text)", margin: 0 }}>Excluir projeto?</h3>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Esta ação não pode ser desfeita.</p>
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
                  {editingId ? "Editar Projeto" : "Novo Projeto"}
                </h3>
                <button onClick={closeForm} className="nid-modal__close">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="nid-form-label">Título *</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                    required
                    className="nid-form-input"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Eixo *</label>
                  <select
                    value={form.eixo_id}
                    onChange={(e) => setForm((p) => ({ ...p, eixo_id: e.target.value }))}
                    required
                    className="nid-form-input"
                  >
                    <option value="">Selecione um eixo</option>
                    {eixos.map((e) => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="nid-form-input"
                  >
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Departamento</label>
                  <input
                    value={form.departamento}
                    onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))}
                    placeholder="Ex.: Secretaria de Obras"
                    className="nid-form-input"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Responsável</label>
                  <input
                    value={form.responsavel}
                    onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))}
                    placeholder="Nome do responsável"
                    className="nid-form-input"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Data de Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                    className="nid-form-input"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="nid-form-label">Prazo</label>
                  <input
                    type="date"
                    value={form.data_prazo}
                    onChange={(e) => setForm((p) => ({ ...p, data_prazo: e.target.value }))}
                    className="nid-form-input"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="nid-form-label">Descrição resumida</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    className="nid-form-input"
                    style={{ resize: "none" }}
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="nid-form-label">Conteúdo / Progresso</label>
                  <textarea
                    value={form.conteudo}
                    onChange={(e) => setForm((p) => ({ ...p, conteudo: e.target.value }))}
                    rows={4}
                    placeholder="Descreva o andamento, metas, observações..."
                    className="nid-form-input"
                    style={{ resize: "none" }}
                  />
                </div>

                <div className="md:col-span-2" style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
                  {formError && <p style={{ fontSize: 13, color: "var(--accent-2)", flex: 1 }}>{formError}</p>}
                  <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
                    <button type="button" onClick={closeForm} className="nid-modal__btn-cancel">Cancelar</button>
                    <button type="submit" disabled={saving} className="nid-modal__btn-primary">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Projeto"}
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
