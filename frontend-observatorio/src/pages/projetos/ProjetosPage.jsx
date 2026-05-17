import { useState } from "react";
import { motion } from "framer-motion";
import { FolderOpenIcon } from "@heroicons/react/24/outline";
import AcervoTab from "./AcervoTab";
import AcompanhamentoTab from "./AcompanhamentoTab";
import NidTabBar from "../../components/nid/NidTabBar";

const TABS = [
  { key: "acervo",         label: "Acervo de Projetos" },
  { key: "acompanhamento", label: "Acompanhamento" },
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <FolderOpenIcon style={{ width: 28, height: 28, color: "var(--accent-1)" }} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
            Projetos
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
            Acervo de modelos e acompanhamento de projetos municipais.
          </p>
        </div>
      </div>

      {/* Top-level tab bar */}
      <NidTabBar
        tabs={TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Seção de projetos"
      />

      {/* Tab content */}
      {activeTab === "acervo" ? (
        <AcervoTab onSelectSuccess={() => setActiveTab("acompanhamento")} />
      ) : (
        <AcompanhamentoTab />
      )}
    </motion.div>
  );
}
