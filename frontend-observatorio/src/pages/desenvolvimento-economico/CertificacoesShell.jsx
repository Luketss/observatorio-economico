import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TrophyIcon } from "@heroicons/react/24/outline";
import NidTabBar from "../../components/nid/NidTabBar";

// Ordem das abas = ordem aprovada do módulo 16 (cliente).
export const ABAS_CERTIFICACOES = [
  { key: "premiacoes", label: "Premiações", rota: "/app/desenvolvimento-economico/premiacoes" },
  { key: "captacao", label: "Captação de Recursos", rota: "/app/desenvolvimento-economico/captacao" },
  { key: "escrita", label: "Escrita de Projetos", rota: "/app/desenvolvimento-economico/escrita" },
  { key: "dinheiro-na-mesa", label: "Dinheiro na Mesa", rota: "/app/dinheiro-na-mesa" },
  { key: "emendas", label: "Emendas", rota: "/app/emendas" },
];

/** Shell do módulo "Certificações e Premiações": header único + abas que
 *  NAVEGAM entre as 5 rotas existentes (aba ativa = rota atual). */
export default function CertificacoesShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const ativa =
    ABAS_CERTIFICACOES.find((a) => location.pathname.startsWith(a.rota))?.key ?? "premiacoes";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <TrophyIcon className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Certificações e Premiações
          </h1>
          <p className="text-xs mt-0.5 text-[var(--text-dim)]">
            Oportunidades, captação e reconhecimentos do município.
          </p>
        </div>
      </div>

      <NidTabBar
        tabs={ABAS_CERTIFICACOES.map((a) => ({ key: a.key, label: a.label }))}
        value={ativa}
        onChange={(v) => {
          const aba = typeof v === "number" ? ABAS_CERTIFICACOES[v] : ABAS_CERTIFICACOES.find((a) => a.key === v);
          if (aba && aba.key !== ativa) navigate(aba.rota);
        }}
        ariaLabel="Seções de Certificações e Premiações"
      />

      {children}
    </motion.div>
  );
}
