import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { NidPageHeader } from "../../components/nid/Panel";
import KpiCard from "../../components/KpiCard";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import PlanGate from "../../components/PlanGate";
import InsightsPanel from "../../components/InsightsPanel";
import { METRICAS_ECONOMICAS, ORDEM_ECONOMICA } from "../../utils/metricasEconomicas";

// Labels curtos dos chips do seletor de insights (os labels dos cards são os
// do registry, mais descritivos).
const CHIP_LABELS = { pib: "PIB", vaf: "VAF", empresas: "Empresas", estban: "Bancos", comex: "COMEX", pix: "PIX" };

const HEADER = (
  <NidPageHeader
    title="Análise Econômica"
    sub="Leitura consolidada das bases econômicas do município"
  />
);

export default function AnaliseEconomicaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [resumos, setResumos] = useState({});
  const [loading, setLoading] = useState(true);
  const [dataset, setDataset] = useState("pib");

  useEffect(() => {
    if (needsMunicipio) return;
    let alive = true;
    const safeGet = (url) => api.get(url).then((r) => r.data).catch(() => null);
    Promise.all(ORDEM_ECONOMICA.map((key) => safeGet(METRICAS_ECONOMICAS[key].resumoPath))).then((res) => {
      if (!alive) return;
      const map = {};
      ORDEM_ECONOMICA.forEach((key, i) => { map[key] = res[i]; });
      setResumos(map);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [needsMunicipio]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {HEADER}
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {HEADER}

      <div className="grid gap-4 md:grid-cols-3">
        {loading
          ? ORDEM_ECONOMICA.map((key) => <KpiSkeleton key={key} height={110} />)
          : ORDEM_ECONOMICA.map((key, i) => {
              const m = METRICAS_ECONOMICAS[key];
              const p = m.pick(resumos[key]);
              return (
                <PlanGate key={key} planKey={m.planKey}>
                  <Link to={m.route} className="block" aria-label={`Aprofundar em ${m.label}`}>
                    <KpiCard
                      label={m.label}
                      value={p.value}
                      unit={p.unit}
                      delta={p.delta}
                      sub={p.foot}
                      delay={i * 0.03}
                    />
                  </Link>
                </PlanGate>
              );
            })}
      </div>

      <div>
        <div className="nid-panel-actions mb-3" role="group" aria-label="Base dos insights">
          {ORDEM_ECONOMICA.map((key) => (
            <button
              key={key}
              type="button"
              className={`nid-tab ${dataset === key ? "active" : ""}`}
              aria-pressed={dataset === key}
              onClick={() => setDataset(key)}
            >
              {CHIP_LABELS[key]}
            </button>
          ))}
        </div>
        <InsightsPanel key={dataset} dataset={dataset} />
      </div>
    </motion.div>
  );
}
