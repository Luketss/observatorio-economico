import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { usePermissao } from "../../hooks/usePermissao";
import NidDrawer from "../../components/nid/NidDrawer";
import NidTabBar from "../../components/nid/NidTabBar";

const STATUS_PILL = {
  atendido: { label: "Atendido", color: "var(--accent-5)" },
  em_andamento: { label: "Em andamento", color: "var(--accent-4)" },
  pendente: { label: "Pendente", color: "var(--text-mute)" },
};
const STATUS_TAB_LABEL = { pendente: "Pendentes", em_andamento: "Em andamento", atendido: "Atendidos" };
const ORDEM_STATUS = ["pendente", "em_andamento", "atendido"];

const inputCls = "w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500";

const defaultReqForm = { titulo: "", categoria: "", status: "pendente", responsavel: "", evidencia_url: "", evidencia_nota: "" };
const defaultCertForm = { nome: "", entidade: "", descricao: "" };

function StatusPillToken({ status }) {
  const cfg = STATUS_PILL[status] || { label: status, color: "var(--text-mute)" };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ color: cfg.color, background: `color-mix(in oklab, ${cfg.color} 14%, transparent)` }}
    >
      {cfg.label}
    </span>
  );
}

export default function CertificacaoDrawer({ certId, onClose }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const canEditar = usePermissao("cidade_inteligente", "editar") && !isGlobal;
  const canExcluirCert = usePermissao("cidade_inteligente", "excluir") && !isGlobal;

  const [detalhe, setDetalhe] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [formAberto, setFormAberto] = useState(false);
  const [reqForm, setReqForm] = useState(defaultReqForm);
  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editandoCert, setEditandoCert] = useState(false);
  const [certForm, setCertForm] = useState(defaultCertForm);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const carregando = certId != null && (detalhe == null || detalhe.id !== certId);

  function carregar() {
    return api.get(`/cidade-inteligente/certificacoes/${certId}`)
      .then((r) => setDetalhe(r.data))
      .catch(() => {
        addToast("Não foi possível carregar a certificação", "error");
        onClose();
      });
  }
  useEffect(() => {
    if (certId == null) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certId]);

  async function chamar(fn, okMsg, errMsg) {
    setSalvando(true);
    try {
      await fn();
      addToast(okMsg, "success");
      await carregar();
    } catch (err) {
      addToast(err?.response?.data?.detail || errMsg, "error");
    } finally {
      setSalvando(false);
    }
  }

  function adicionarRequisito() {
    if (!reqForm.titulo.trim()) { addToast("Informe o título do requisito", "error"); return; }
    chamar(async () => {
      await api.post(`/cidade-inteligente/certificacoes/${certId}/requisitos`, {
        titulo: reqForm.titulo,
        categoria: reqForm.categoria || null,
        status: reqForm.status,
        responsavel: reqForm.responsavel || null,
        evidencia_url: reqForm.evidencia_url || null,
        evidencia_nota: reqForm.evidencia_nota || null,
      });
      setReqForm(defaultReqForm);
      setFormAberto(false);
    }, "Requisito adicionado", "Erro ao adicionar requisito");
  }

  function mudarStatus(req, status) {
    setEditingStatusId(null);
    chamar(() => api.put(`/cidade-inteligente/requisitos/${req.id}`, { status }),
      "Status atualizado", "Erro ao atualizar status");
  }

  function excluirRequisito(req) {
    chamar(() => api.delete(`/cidade-inteligente/requisitos/${req.id}`),
      "Requisito removido", "Erro ao excluir requisito");
  }

  function abrirEdicaoCert() {
    setCertForm({
      nome: detalhe.nome,
      entidade: detalhe.entidade || "",
      descricao: detalhe.descricao || "",
    });
    setEditandoCert(true);
  }

  function salvarCert() {
    if (!certForm.nome.trim()) { addToast("Informe o nome da certificação", "error"); return; }
    chamar(async () => {
      await api.put(`/cidade-inteligente/certificacoes/${certId}`, {
        nome: certForm.nome,
        entidade: certForm.entidade || null,
        descricao: certForm.descricao || null,
      });
      setEditandoCert(false);
    }, "Certificação atualizada", "Erro ao atualizar certificação");
  }

  function excluirCertificacao() {
    setSalvando(true);
    api.delete(`/cidade-inteligente/certificacoes/${certId}`)
      .then(() => {
        addToast("Certificação removida", "success");
        onClose();
      })
      .catch((err) => addToast(err?.response?.data?.detail || "Erro ao excluir certificação", "error"))
      .finally(() => setSalvando(false));
  }

  const requisitos = detalhe?.requisitos || [];
  const statusPresentes = ORDEM_STATUS.filter((s) => requisitos.some((r) => r.status === s));
  const tabs = detalhe
    ? [
        { key: "todos", label: "Todos", count: detalhe.total },
        ...statusPresentes.map((s) => ({
          key: s,
          label: STATUS_TAB_LABEL[s],
          count: requisitos.filter((r) => r.status === s).length,
        })),
      ]
    : [];
  const requisitosFiltrados = filtroStatus === "todos" ? requisitos : requisitos.filter((r) => r.status === filtroStatus);

  return (
    <NidDrawer open={certId != null} onClose={onClose} ariaLabel="Detalhe da certificação">
      {carregando ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : detalhe ? (
        <div className="space-y-4">
          <div className="pr-8 flex items-start justify-between gap-2">
            {editandoCert ? (
              <div className="flex-1 space-y-2">
                <input aria-label="Nome da certificação" value={certForm.nome}
                  onChange={(e) => setCertForm((p) => ({ ...p, nome: e.target.value }))} className={inputCls} />
                <input aria-label="Entidade da certificação" value={certForm.entidade}
                  onChange={(e) => setCertForm((p) => ({ ...p, entidade: e.target.value }))} className={inputCls} />
                <textarea aria-label="Descrição da certificação" rows={2} value={certForm.descricao}
                  onChange={(e) => setCertForm((p) => ({ ...p, descricao: e.target.value }))}
                  className={`${inputCls} resize-none`} />
                <div className="flex gap-2">
                  <button type="button" onClick={salvarCert} disabled={salvando}
                    className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Salvar
                  </button>
                  <button type="button" onClick={() => setEditandoCert(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  {detalhe.entidade && <p className="text-[11px] uppercase tracking-wider text-slate-400">{detalhe.entidade}</p>}
                  <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{detalhe.nome}</h2>
                  {detalhe.descricao && <p className="text-xs text-slate-400 mt-1">{detalhe.descricao}</p>}
                </div>
                {(canEditar || canExcluirCert) && !confirmandoExclusao && (
                  <div className="flex gap-1 shrink-0">
                    {canEditar && (
                      <button type="button" onClick={abrirEdicaoCert} aria-label="Editar certificação"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canExcluirCert && (
                      <button type="button" onClick={() => setConfirmandoExclusao(true)} aria-label="Excluir certificação"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {confirmandoExclusao && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text)]">Excluir esta certificação?</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={excluirCertificacao} disabled={salvando}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                  Confirmar
                </button>
                <button type="button" onClick={() => setConfirmandoExclusao(false)}
                  className="px-3 py-1 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(detalhe.atendidos / detalhe.total) * 100 || 0}%`, background: "var(--accent-5)" }} />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">{detalhe.atendidos} de {detalhe.total} atendidos</p>
          </div>

          <NidTabBar tabs={tabs} value={filtroStatus} onChange={setFiltroStatus} ariaLabel="Status dos requisitos" />

          <div className="space-y-3">
            {requisitosFiltrados.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">
                {filtroStatus === "todos" ? "Nenhum requisito cadastrado ainda." : "Nenhum requisito nesta categoria."}
              </p>
            ) : (
              requisitosFiltrados.map((req) => (
                <div key={req.id} className="rounded-xl border border-[var(--border)] p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text)]">{req.titulo}</p>
                      {req.categoria && <p className="text-[11px] text-slate-400">{req.categoria}</p>}
                    </div>
                    {canEditar && (
                      <div className="flex gap-1 shrink-0">
                        <button type="button"
                          onClick={() => setEditingStatusId(editingStatusId === req.id ? null : req.id)}
                          aria-label={`Editar status de ${req.titulo}`}
                          className="p-1 rounded text-slate-300 hover:text-blue-500 transition-colors cursor-pointer">
                          <PencilIcon className="w-3 h-3" />
                        </button>
                        <button type="button"
                          onClick={() => excluirRequisito(req)}
                          aria-label={`Excluir requisito ${req.titulo}`}
                          className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer">
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingStatusId === req.id ? (
                    <select aria-label={`Status do requisito ${req.titulo}`} value={req.status}
                      onChange={(e) => mudarStatus(req, e.target.value)} className={inputCls}>
                      {Object.entries(STATUS_PILL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  ) : (
                    <StatusPillToken status={req.status} />
                  )}

                  {req.responsavel && <p className="text-[11px] text-slate-400">{req.responsavel}</p>}
                  {req.evidencia_nota && <p className="text-xs text-[var(--text-dim)]">{req.evidencia_nota}</p>}
                  {req.evidencia_url && (
                    <a href={req.evidencia_url} target="_blank" rel="noopener noreferrer"
                      className="inline-block text-xs text-blue-600 hover:text-blue-700 font-medium">
                      Ver evidência →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>

          {canEditar && (
            <div className="border-t border-[var(--border)] pt-3 space-y-2">
              {formAberto ? (
                <>
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Novo requisito</p>
                  <input aria-label="Título do requisito" placeholder="Título *" value={reqForm.titulo}
                    onChange={(e) => setReqForm((p) => ({ ...p, titulo: e.target.value }))} className={inputCls} />
                  <input aria-label="Categoria do requisito" placeholder="Categoria" value={reqForm.categoria}
                    onChange={(e) => setReqForm((p) => ({ ...p, categoria: e.target.value }))} className={inputCls} />
                  <select aria-label="Status do novo requisito" value={reqForm.status}
                    onChange={(e) => setReqForm((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
                    {Object.entries(STATUS_PILL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input aria-label="Responsável pelo requisito" placeholder="Responsável" value={reqForm.responsavel}
                    onChange={(e) => setReqForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <input aria-label="URL da evidência" placeholder="https://..." value={reqForm.evidencia_url}
                    onChange={(e) => setReqForm((p) => ({ ...p, evidencia_url: e.target.value }))} className={inputCls} />
                  <textarea aria-label="Nota da evidência" placeholder="Nota da evidência" rows={2} value={reqForm.evidencia_nota}
                    onChange={(e) => setReqForm((p) => ({ ...p, evidencia_nota: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <button type="button" onClick={adicionarRequisito} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Adicionar requisito
                  </button>
                  <button type="button" onClick={() => { setFormAberto(false); setReqForm(defaultReqForm); }}
                    className="w-full py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setFormAberto(true)}
                  className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer">
                  Novo requisito
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
    </NidDrawer>
  );
}
