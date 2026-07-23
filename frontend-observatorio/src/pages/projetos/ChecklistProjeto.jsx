import { useState } from "react";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { tarefaAtrasada } from "../../utils/projetoStatus";

function fmtData(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function ChecklistProjeto({ projeto, canEditar, onChange }) {
  const { addToast } = useToast();
  const tarefas = projeto.tarefas || [];
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editPrazo, setEditPrazo] = useState("");
  const [saving, setSaving] = useState(false);

  async function adicionar(e) {
    e.preventDefault();
    if (saving) return;
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    setSaving(true);
    try {
      const res = await api.post(`/projetos/${projeto.id}/tarefas`, {
        titulo,
        prazo: novoPrazo || null,
      });
      onChange([...tarefas, res.data]);
      setNovoTitulo("");
      setNovoPrazo("");
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao adicionar tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(t) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.put(`/projetos/${projeto.id}/tarefas/${t.id}`, {
        concluida: !t.concluida,
      });
      onChange(tarefas.map((x) => (x.id === t.id ? res.data : x)));
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao atualizar tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  function comecarEdicao(t) {
    setEditandoId(t.id);
    setEditTitulo(t.titulo);
    setEditPrazo(t.prazo || "");
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    if (saving) return;
    const titulo = editTitulo.trim();
    if (!titulo) return;
    setSaving(true);
    try {
      const res = await api.put(`/projetos/${projeto.id}/tarefas/${editandoId}`, {
        titulo,
        prazo: editPrazo || null,
      });
      onChange(tarefas.map((x) => (x.id === editandoId ? res.data : x)));
      setEditandoId(null);
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao salvar tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(t) {
    if (saving) return;
    setSaving(true);
    try {
      await api.delete(`/projetos/${projeto.id}/tarefas/${t.id}`);
      onChange(tarefas.filter((x) => x.id !== t.id));
      addToast("Tarefa excluída", "success");
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao excluir tarefa", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", margin: 0 }}>
        Checklist
      </p>

      {tarefas.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-mute)", margin: 0 }}>Nenhuma tarefa ainda.</p>
      )}

      {tarefas.map((t) => {
        const atrasada = tarefaAtrasada(t);
        if (editandoId === t.id) {
          return (
            <form key={t.id} onSubmit={salvarEdicao} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                className="nid-form-input"
                style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
                aria-label="Título da tarefa"
                autoFocus
              />
              <input
                type="date"
                value={editPrazo}
                onChange={(e) => setEditPrazo(e.target.value)}
                className="nid-form-input"
                style={{ fontSize: 12, padding: "4px 8px", width: 140 }}
                aria-label="Prazo da tarefa"
              />
              <button type="submit" disabled={saving} aria-label="Salvar tarefa" className="proj-card__icon-btn">
                <CheckIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setEditandoId(null)} aria-label="Cancelar edição" className="proj-card__icon-btn">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </form>
          );
        }
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={t.concluida}
              onChange={() => toggle(t)}
              disabled={!canEditar || saving}
              aria-label={`Concluir ${t.titulo}`}
              style={{ cursor: canEditar ? "pointer" : "default", flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: atrasada ? "var(--accent-2)" : t.concluida ? "var(--text-mute)" : "var(--text)",
                textDecoration: t.concluida ? "line-through" : "none",
              }}
            >
              {t.titulo}
            </span>
            {t.prazo && (
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: atrasada ? "var(--accent-2)" : "var(--text-mute)", flexShrink: 0 }}>
                {fmtData(t.prazo)}
                {atrasada && " !"}
              </span>
            )}
            {canEditar && (
              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => comecarEdicao(t)} disabled={saving} aria-label="Editar tarefa" className="proj-card__icon-btn">
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => excluir(t)} disabled={saving} aria-label="Excluir tarefa" className="proj-card__icon-btn proj-card__icon-btn--danger">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        );
      })}

      {canEditar && (
        <form onSubmit={adicionar} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            placeholder="+ Nova tarefa"
            className="nid-form-input"
            style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
            aria-label="Nova tarefa"
          />
          <input
            type="date"
            value={novoPrazo}
            onChange={(e) => setNovoPrazo(e.target.value)}
            className="nid-form-input"
            style={{ fontSize: 12, padding: "4px 8px", width: 140 }}
            aria-label="Prazo da nova tarefa"
          />
          <button type="submit" disabled={saving || !novoTitulo.trim()} aria-label="Adicionar tarefa" className="proj-card__icon-btn">
            <PlusIcon className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
