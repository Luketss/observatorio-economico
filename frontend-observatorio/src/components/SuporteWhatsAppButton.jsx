import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import { linkWhatsApp } from "../config/contato";

export default function SuporteWhatsAppButton() {
  const { user } = useAuth();
  const nome = user?.nome;
  const email = user?.email;
  const mensagem =
    nome && email
      ? `Olá! Sou ${nome} (${email}) e preciso de atendimento no NID.`
      : "Olá! Preciso de atendimento no NID.";

  return (
    <a
      href={linkWhatsApp(mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      title="Falar com o suporte pelo WhatsApp"
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
    >
      <ChatBubbleLeftRightIcon className="w-4 h-4" />
      Falar com o suporte
    </a>
  );
}
