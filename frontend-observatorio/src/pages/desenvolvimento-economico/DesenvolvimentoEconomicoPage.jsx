import { useState } from "react";
import { motion } from "framer-motion";
import {
  FunnelIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
  PencilSquareIcon,
  TrophyIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import FunilTab from "./FunilTab";
import RetencaoTab from "./RetencaoTab";
import CaptacaoTab from "./CaptacaoTab";
import EscritaTab from "./EscritaTab";
import PremiacoesTab from "./PremiacoesTab";

const TABS = [
  { id: "funil", label: "Funil de Investimentos", icon: FunnelIcon },
  { id: "retencao", label: "Retenção & Expansão", icon: BuildingOffice2Icon },
  { id: "captacao", label: "Captação de Recursos", icon: BanknotesIcon },
  { id: "escrita", label: "Escrita de Projetos", icon: PencilSquareIcon },
  { id: "premiacoes", label: "Premiações", icon: TrophyIcon },
];

export default function DesenvolvimentoEconomicoPage() {
  const [activeTab, setActiveTab] = useState("funil");

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <ChartBarIcon className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            Desenvolvimento Econômico
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Funil de investimentos, retenção de empresas, captação de recursos e premiações.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                active
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "funil" && <FunilTab />}
      {activeTab === "retencao" && <RetencaoTab />}
      {activeTab === "captacao" && <CaptacaoTab />}
      {activeTab === "escrita" && <EscritaTab />}
      {activeTab === "premiacoes" && <PremiacoesTab />}
    </motion.div>
  );
}
