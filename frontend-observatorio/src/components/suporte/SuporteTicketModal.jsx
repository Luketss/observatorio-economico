import { useCallback, useState } from "react";
// eslint-disable-next-line no-unused-vars -- falso positivo: motion.* usado em JSX (mesmo caso do AlterarSenhaModal)
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { mensagemErroApi } from "./erroApi";

const MAX = 4000;

export default function SuporteTicketModal({ open, onClose }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [mensagem, setMensagem] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [canal, setCanal] = useState("email");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setMensagem("");
    setWhatsapp("");
    setCanal("email");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEscapeKey(handleClose, open);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const texto = mensagem.trim();
    const numero = whatsapp.trim();
    if (texto.length < 10) {
      setError("Descreva sua solicitação com pelo menos 10 caracteres.");
      return;
    }
    if (canal === "whatsapp" && !numero) {
      setError("Informe o WhatsApp para ser contatado por esse canal.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/suporte/tickets", {
        mensagem: texto,
        whatsapp: numero || null,
        canal_preferido: canal,
      });
      addToast(
        `Solicitação enviada. Vamos entrar em contato por ${canal === "whatsapp" ? "WhatsApp" : "e-mail"}.`,
        "success",
      );
      reset();
      onClose();
    } catch (err) {
      setError(mensagemErroApi(err, "Não foi possível enviar. Tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] text-sm outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium mb-1 text-[var(--text-dim)]";

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
            className="w-full max-w-md rounded-2xl shadow-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text)]">Abrir solicitação de suporte</h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fechar"
                className="p-1 rounded-lg text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="suporte-mensagem" className={labelCls}>
                Conte o que aconteceu ou o que você precisa
              </label>
              <textarea
                id="suporte-mensagem"
                rows={5}
                maxLength={MAX}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className={inputCls}
              />
              <div className="flex items-start justify-between gap-2 mt-1 text-[11px] text-[var(--text-mute)]">
                <span>Não inclua dados pessoais de terceiros (CPF, telefone de outras pessoas).</span>
                <span className="shrink-0">{mensagem.length}/{MAX}</span>
              </div>
            </div>

            <div>
              <label htmlFor="suporte-whatsapp" className={labelCls}>WhatsApp para contato</label>
              <input
                id="suporte-whatsapp"
                type="text"
                inputMode="tel"
                placeholder="(37) 99999-9999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className={inputCls}
              />
            </div>

            <fieldset className="space-y-1">
              <legend className={labelCls}>Prefiro ser contatado por</legend>
              <div className="flex gap-4 text-sm text-[var(--text)]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="suporte-canal"
                    value="email"
                    checked={canal === "email"}
                    onChange={() => setCanal("email")}
                  />
                  E-mail
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="suporte-canal"
                    value="whatsapp"
                    checked={canal === "whatsapp"}
                    onChange={() => setCanal("whatsapp")}
                  />
                  WhatsApp
                </label>
              </div>
            </fieldset>

            <p className="text-[11px] text-[var(--text-mute)]">
              Vamos usar: {user?.nome} · {user?.email}
            </p>

            {error && (
              <p className="text-xs" style={{ color: "var(--accent-2)" }} role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-2 rounded-lg text-sm cursor-pointer border border-[var(--border)] text-[var(--text-dim)] bg-[var(--panel-2)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60 transition-opacity"
                style={{ background: "var(--accent-1)", color: "var(--bg)" }}
              >
                {saving ? "Enviando..." : "Enviar solicitação"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
