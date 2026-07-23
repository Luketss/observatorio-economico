import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

export default function AlterarSenhaModal({ open, onClose }) {
  const { addToast } = useToast();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEscapeKey(handleClose, open);

  function reset() {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmar("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (novaSenha.length < 6) {
      setError("A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/alterar-senha", {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      addToast("Senha alterada com sucesso.", "success");
      reset();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] text-sm outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.form
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-2xl shadow-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Alterar senha
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fechar"
                className="p-1 rounded-lg text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <input
              type="password"
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
            />
            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
            />
            {error && (
              <p className="text-xs" style={{ color: "var(--accent-2)" }} role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60 transition-opacity"
              style={{ background: "var(--accent-1)", color: "var(--bg)" }}
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
