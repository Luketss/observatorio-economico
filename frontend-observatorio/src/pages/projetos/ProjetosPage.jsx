import { useState } from "react";
import { motion } from "framer-motion";
import { FolderOpenIcon, BookOpenIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import AcervoTab from "./AcervoTab";
import AcompanhamentoTab from "./AcompanhamentoTab";

const TABS = [
  { id: "acervo", label: "Acervo de Projetos", icon: BookOpenIcon },
  { id: "acompanhamento", label: "Acompanhamento", icon: ClipboardDocumentListIcon },
];

export default function ProjetosPage() {
  const [activeTab, setActiveTab] = useState("acervo");

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <FolderOpenIcon className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            Projetos
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Acervo de modelos e acompanhamento de projetos municipais.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
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
      {activeTab === "acervo" ? (
        <AcervoTab onSelectSuccess={() => setActiveTab("acompanhamento")} />
      ) : (
        <AcompanhamentoTab />
      )}
    </motion.div>
  );
}
