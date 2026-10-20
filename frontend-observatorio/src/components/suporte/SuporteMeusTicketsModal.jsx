// Modal "Meus atendimentos": lista as solicitacoes de suporte abertas pelo usuario (somente leitura).
import { useEffect, useState } from "react";
// eslint-disable-next-line no-unused-vars -- falso positivo: motion.* usado em JSX (mesmo caso do AlterarSenhaModal)
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import StatusChip from "./StatusChip";

function formatarData(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ItemTicket({ ticket }) {
  const [expandido, setExpandido] = useState(false);
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--text-mute)]">{formatarData(ticket.criado_em)}</span>
        <StatusChip status={ticket.status} />
      </div>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className="block w-full text-left cursor-pointer"
      >
        <span
          className={`block text-sm text-[var(--text)] whitespace-pre-wrap break-words ${expandido ? "" : "line-clamp-3"}`}
        >
          {ticket.mensagem}
        </span>
      </button>
    </li>
  );
}

export default function SuporteMeusTicketsModal({ open, onClose, onAbrirNovo }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEscapeKey(onClose, open);

  useEffect(() => {
    if (!open) return undefined;
    let ativo = true;
    api
      .get("/suporte/tickets/meus")
      .then((res) => {
        if (ativo) setTickets(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (ativo) setError(true);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
      // rearma o estado de carregamento para a proxima abertura
      setLoading(true);
      setError(false);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl shadow-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text)]">Meus atendimentos</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="p-1 rounded-lg text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2">
              {loading && <p className="text-xs text-[var(--text-mute)]">Carregando…</p>}

              {!loading && error && (
                <p className="text-xs" style={{ color: "var(--accent-2)" }} role="alert">
                  Não foi possível carregar suas solicitações.
                </p>
              )}

              {!loading && !error && tickets.length === 0 && (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-[var(--text-dim)]">Você ainda não abriu nenhuma solicitação.</p>
                  <button
                    type="button"
                    onClick={() => onAbrirNovo()}
                    className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: "var(--accent-1)", color: "var(--bg)" }}
                  >
                    Abrir solicitação
                  </button>
                </div>
              )}

              {!loading && !error && tickets.length > 0 && (
                <ul className="space-y-2">
                  {tickets.map((t) => (
                    <ItemTicket key={t.id} ticket={t} />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
