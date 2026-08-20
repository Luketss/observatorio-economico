import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { NidPageHeader } from "../../components/nid/Panel";
import NidTabBar from "../../components/nid/NidTabBar";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import ComparacaoPares from "./ComparacaoPares";
import RankingTab from "./RankingTab";

const ABAS = [
  { key: "pares", label: "Comparação com pares" },
  { key: "ranking", label: "Ranking nacional" },
];

export default function BenchmarkPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  // Guard só na aba de pares (ela precisa de um foco). O ranking nacional é
  // uma visão do país inteiro e continua acessível sem view-as.
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;
  const [aba, setAba] = useState("pares");

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <NidPageHeader
        title="Benchmark Municipal"
        sub="Seu município comparado aos pares e ao país."
      />
      <NidTabBar tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Abas do benchmark" />
      {aba === "pares"
        ? (needsMunicipio ? <SelecioneMunicipio /> : <ComparacaoPares />)
        : <RankingTab />}
    </motion.div>
  );
}
