import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import bg from "../../assets/bg.jpeg";
import nidLogo from "../../assets/nid_fundo_transparente.png";
import logo from "../../assets/logo_uaizi.png";

// Caixa de erro padrão das telas de autenticação. Não renderiza nada sem mensagem.
export function ErroInline({ mensagem }) {
  if (!mensagem) return null;
  return (
    <div role="alert" aria-live="polite" className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-3 rounded-xl">
      <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
      {mensagem}
    </div>
  );
}

// Fundo, logo, card e rodapé compartilhados por /login, /esqueci-senha e /redefinir-senha.
export default function LoginShell({ titulo, subtitulo, children }) {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-slate-950/95" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-blue-950/30 via-transparent to-transparent" aria-hidden="true" />

      <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute top-6 left-6">
        <Link to="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 text-xs font-medium transition-colors group focus:outline-none focus:text-white/80" aria-label="Voltar para página inicial">
          <ArrowLeftIcon className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          Voltar
        </Link>
      </motion.div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-5">
        <motion.div initial={{ opacity: 0, scale: 0.85, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <img src={nidLogo} alt="NID — Núcleo de Inteligência de Dados" className="h-28 object-contain mx-auto"
            style={{ filter: "drop-shadow(0 0 24px rgba(59,130,246,0.5)) drop-shadow(0 0 48px rgba(99,102,241,0.25))" }} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.55, ease: "easeOut" }} className="w-full">
          <div className="w-full bg-white/[0.97] backdrop-blur-md rounded-2xl shadow-2xl shadow-black/40 border border-white/20 p-8">
            <div className="mb-7 text-center">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">{titulo}</h1>
              {subtitulo && <p className="text-slate-400 text-xs mt-1">{subtitulo}</p>}
            </div>
            {children}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }} className="flex flex-col items-center gap-2">
          <img src={logo} alt="UAIZI" className="h-10 object-contain opacity-70" />
          <p className="text-white/25 text-[10px] tracking-widest uppercase">Observatório Econômico Municipal</p>
        </motion.div>
      </div>
    </div>
  );
}
