import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../../context/AuthContext";
import { linkWhatsApp } from "../../config/contato";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import SuporteTicketModal from "./SuporteTicketModal";
import SuporteMeusTicketsModal from "./SuporteMeusTicketsModal";

const ITEM_CLASS =
  "w-full flex items-start gap-2 px-3 py-2 text-left text-xs cursor-pointer hover:opacity-80";

function ItemTexto({ titulo, ajuda }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium" style={{ color: "var(--text)" }}>{titulo}</span>
      <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{ajuda}</span>
    </span>
  );
}

export default function SuporteButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const ref = useRef(null);

  const nome = user?.nome;
  const email = user?.email;
  const mensagem =
    nome && email
      ? `Olá! Sou ${nome} (${email}) e preciso de atendimento no NID.`
      : "Olá! Preciso de atendimento no NID.";

  const fechar = useCallback(() => setOpen(false), []);
  useEscapeKey(fechar, open);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function escolher(destino) {
    setModal(destino);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
      >
        <ChatBubbleLeftRightIcon className="w-4 h-4" />
        Falar com o suporte
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-lg shadow-lg z-20 overflow-hidden"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
        >
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => escolher("novo")}>
            <PencilSquareIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-dim)" }} />
            <ItemTexto titulo="Abrir solicitação" ajuda="Conte o problema e a gente entra em contato" />
          </button>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => escolher("meus")}>
            <ClipboardDocumentListIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-dim)" }} />
            <ItemTexto titulo="Meus atendimentos" ajuda="Veja o status das solicitações que você abriu" />
          </button>
          <a
            role="menuitem"
            href={linkWhatsApp(mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className={ITEM_CLASS}
            onClick={fechar}
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-dim)" }} />
            <ItemTexto titulo="WhatsApp" ajuda="Falar agora pelo WhatsApp" />
          </a>
        </div>
      )}

      <SuporteTicketModal open={modal === "novo"} onClose={() => setModal(null)} />
      <SuporteMeusTicketsModal
        open={modal === "meus"}
        onClose={() => setModal(null)}
        onAbrirNovo={() => setModal("novo")}
      />
    </div>
  );
}
