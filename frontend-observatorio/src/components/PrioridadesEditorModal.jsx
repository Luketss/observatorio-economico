import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
import {
  TIPOS_PRIORIDADE,
  DATASET_LABEL,
  parseTitulo,
  montarTitulo,
  validarItens,
} from "../utils/prioridadesForm";

const itemVazio = () => ({ tipo: "", texto: "", observacao: "", dataset_referencia: "" });

function itensDe(inicial) {
  if (!inicial?.prioridades?.length) return [itemVazio()];
  return inicial.prioridades.slice(0, 3).map((p) => {
    const { tipo, texto } = parseTitulo(p.titulo);
    return {
      tipo: tipo || "",
      texto,
      observacao: p.observacao || "",
      dataset_referencia: p.dataset_referencia || "",
    };
  });
}

export default function PrioridadesEditorModal({ aberto, onClose, inicial, municipioId, onSaved }) {
  const { addToast } = useToast();
  const [itens, setItens] = useState([itemVazio()]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setItens(itensDe(inicial));
      setErro(null);
    }
  }, [aberto, inicial]);

  useEscapeKey(useCallback(() => {
    if (aberto && !salvando) onClose();
  }, [aberto, salvando, onClose]));

  function setItem(i, patch) {
    setItens((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItens((prev) => (prev.length >= 3 ? prev : [...prev, itemVazio()]));
  }

  function removeItem(i) {
    setItens((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  async function handleSalvar() {
    const msg = validarItens(itens);
    if (msg) { setErro(msg); return; }
    setSalvando(true);
    setErro(null);
    const payload = {
      prioridades: itens.map((it) => ({
        titulo: montarTitulo(it.tipo || null, it.texto),
        observacao: it.observacao.trim(),
        dataset_referencia: it.dataset_referencia || null,
      })),
    };
    if (typeof municipioId === "number") payload.municipio_id = municipioId;
    try {
      const res = await api.put("/insights/prioridades", payload);
      addToast("Prioridades atualizadas", "success");
      onSaved(res.data);
      onClose();
    } catch (err) {
      const d = err?.response?.data?.detail;
      setErro(typeof d === "string" ? d : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[var(--text)]">Editar prioridades do mês</h3>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {itens.map((item, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                      Prioridade {i + 1}
                    </span>
                    {itens.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        aria-label={`Remover prioridade ${i + 1}`}
                        className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Tipo</label>
                      <select
                        value={item.tipo}
                        onChange={(e) => setItem(i, { tipo: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sem destaque</option>
                        {TIPOS_PRIORIDADE.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Dataset relacionado</label>
                      <select
                        value={item.dataset_referencia}
                        onChange={(e) => setItem(i, { dataset_referencia: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Nenhum</option>
                        {Object.entries(DATASET_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Título *</label>
                    <input
                      value={item.texto}
                      onChange={(e) => setItem(i, { texto: e.target.value })}
                      maxLength={200}
                      className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Observação *</label>
                    <textarea
                      value={item.observacao}
                      onChange={(e) => setItem(i, { observacao: e.target.value })}
                      rows={3}
                      maxLength={1000}
                      className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              ))}

              {itens.length < 3 && (
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:opacity-80 cursor-pointer"
                >
                  <PlusIcon className="w-4 h-4" />
                  Adicionar prioridade
                </button>
              )}

              <div className="flex items-center gap-3 pt-2">
                {erro && <p className="text-sm text-red-600 flex-1">{erro}</p>}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={salvando}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={salvando}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
