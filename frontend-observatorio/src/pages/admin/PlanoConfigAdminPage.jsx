import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";

const MODULOS = [
  { key: "geral", label: "Dashboard Geral" },
  { key: "arrecadacao", label: "Arrecadação Municipal" },
  { key: "pib", label: "PIB Municipal" },
  { key: "caged", label: "CAGED — Empregos Formais" },
  { key: "rais", label: "RAIS — Vínculos Empregatícios" },
  { key: "bolsa_familia", label: "Bolsa Família" },
  { key: "pe_de_meia", label: "Pé-de-Meia" },
  { key: "inss", label: "INSS — Benefícios Previdenciários" },
  { key: "estban", label: "ESTBAN — Estatísticas Bancárias" },
  { key: "comex", label: "Comércio Exterior" },
  { key: "empresas", label: "Empresas — CNPJ" },
  { key: "insights_ia", label: "Insights IA" },
  { key: "timeline_mandato", label: "Timeline do Mandato" },
];

function PlanColumn({ plano, label, modulos, onChange, saving }) {
  const toggle = (key) => {
    const next = modulos.includes(key)
      ? modulos.filter((m) => m !== key)
      : [...modulos, key];
    onChange(next);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">{label}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {modulos.length} de {MODULOS.length} módulos visíveis
          </p>
        </div>
        {saving && (
          <span className="text-xs text-violet-500 font-medium animate-pulse">Salvando...</span>
        )}
      </div>

      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {MODULOS.map(({ key, label: modLabel }) => {
          const enabled = modulos.includes(key);
          return (
            <label
              key={key}
              className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            >
              <span className={`text-sm font-medium ${enabled ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-slate-500"}`}>
                {modLabel}
              </span>
              <div
                onClick={() => toggle(key)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  enabled ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanoConfigAdminPage() {
  const [freeModulos, setFreeModulos] = useState([]);
  const [paidModulos, setPaidModulos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingFree, setSavingFree] = useState(false);
  const [savingPaid, setSavingPaid] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/plano-config", { params: { plano: "free" } }),
      api.get("/plano-config", { params: { plano: "paid" } }),
    ])
      .then(([freeRes, paidRes]) => {
        setFreeModulos(freeRes.data.modulos || []);
        setPaidModulos(paidRes.data.modulos || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveFree = async (next) => {
    setFreeModulos(next);
    setSavingFree(true);
    try {
      await api.put("/plano-config/free", { modulos: next });
    } finally {
      setSavingFree(false);
    }
  };

  const savePaid = async (next) => {
    setPaidModulos(next);
    setSavingPaid(true);
    try {
      await api.put("/plano-config/paid", { modulos: next });
    } finally {
      setSavingPaid(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Planos & Acesso
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Defina quais módulos são visíveis para cada tipo de plano. Alterações têm efeito imediato.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 h-96 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PlanColumn
            plano="free"
            label="Plano Gratuito"
            modulos={freeModulos}
            onChange={saveFree}
            saving={savingFree}
          />
          <PlanColumn
            plano="paid"
            label="Plano Pago"
            modulos={paidModulos}
            onChange={savePaid}
            saving={savingPaid}
          />
        </div>
      )}
    </motion.div>
  );
}
