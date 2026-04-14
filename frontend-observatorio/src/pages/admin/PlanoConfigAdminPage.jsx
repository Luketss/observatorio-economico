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
  { key: "pix", label: "PIX — Transações Instantâneas" },
  { key: "insights_ia", label: "Insights IA" },
  { key: "timeline_mandato", label: "Timeline do Mandato" },
];

const COMPONENTES = [
  { key: "pib.por_setor", label: "PIB — Composição por Setor" },
  { key: "caged.por_sexo", label: "CAGED — Por Sexo" },
  { key: "caged.por_raca", label: "CAGED — Por Raça/Cor" },
  { key: "caged.por_cnae", label: "CAGED — Por Setor (CNAE)" },
  { key: "caged.salario", label: "CAGED — Análise Salarial" },
  { key: "rais.por_sexo", label: "RAIS — Por Sexo" },
  { key: "rais.por_raca", label: "RAIS — Por Raça/Cor" },
  { key: "rais.por_cnae", label: "RAIS — Por Setor (CNAE)" },
  { key: "rais.por_faixa_etaria", label: "RAIS — Por Faixa Etária" },
  { key: "rais.por_escolaridade", label: "RAIS — Por Escolaridade" },
  { key: "rais.por_remuneracao", label: "RAIS — Por Faixa Salarial" },
  { key: "rais.metricas", label: "RAIS — Métricas Avançadas" },
  { key: "estban.por_instituicao", label: "Estban — Por Instituição" },
  { key: "comex.por_produto", label: "Comex — Por Produto" },
  { key: "comex.por_pais", label: "Comex — Por País" },
  { key: "empresas.por_porte", label: "Empresas — Por Porte" },
  { key: "empresas.por_cnae", label: "Empresas — Por CNAE" },
  { key: "pix.detalhado", label: "PIX — Detalhamento PF/PJ" },
];

const TOTAL_ITEMS = MODULOS.length + COMPONENTES.length;

function Toggle({ enabled, onToggle, accent }) {
  return (
    <div
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        enabled ? accent : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </div>
  );
}

function PlanColumn({ label, accent, modulos, onChange, saving }) {
  const toggle = (key) => {
    const next = modulos.includes(key)
      ? modulos.filter((m) => m !== key)
      : [...modulos, key];
    onChange(next);
  };

  const visibleCount = modulos.length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className={`px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between`}>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">{label}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {visibleCount} de {TOTAL_ITEMS} itens visíveis
          </p>
        </div>
        {saving && (
          <span className="text-xs font-medium animate-pulse" style={{ color: "rgb(139 92 246)" }}>
            Salvando...
          </span>
        )}
      </div>

      {/* Módulos (pages) */}
      <div className="px-6 pt-4 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Módulos (Páginas)
        </p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {MODULOS.map(({ key, label: modLabel }) => {
          const enabled = modulos.includes(key);
          return (
            <label
              key={key}
              className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            >
              <span className={`text-sm font-medium ${enabled ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-slate-500"}`}>
                {modLabel}
              </span>
              <Toggle enabled={enabled} onToggle={() => toggle(key)} accent={accent} />
            </label>
          );
        })}
      </div>

      {/* Componentes avançados */}
      <div className="px-6 pt-5 pb-1 border-t border-slate-100 dark:border-slate-800 mt-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Componentes Avançados
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Gráficos e análises dentro das páginas
        </p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {COMPONENTES.map(({ key, label: compLabel }) => {
          const enabled = modulos.includes(key);
          return (
            <label
              key={key}
              className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            >
              <span className={`text-sm ${enabled ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}>
                {compLabel}
              </span>
              <Toggle enabled={enabled} onToggle={() => toggle(key)} accent={accent} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanoConfigAdminPage() {
  const [freeModulos, setFreeModulos] = useState([]);
  const [proModulos, setProModulos] = useState([]);
  const [premiumModulos, setPremiumModulos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingFree, setSavingFree] = useState(false);
  const [savingPro, setSavingPro] = useState(false);
  const [savingPremium, setSavingPremium] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/plano-config", { params: { plano: "free" } }),
      api.get("/plano-config", { params: { plano: "pro" } }),
      api.get("/plano-config", { params: { plano: "premium" } }),
    ])
      .then(([freeRes, proRes, premiumRes]) => {
        setFreeModulos(freeRes.data.modulos || []);
        setProModulos(proRes.data.modulos || []);
        setPremiumModulos(premiumRes.data.modulos || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveFree = async (next) => {
    setFreeModulos(next);
    setSavingFree(true);
    try { await api.put("/plano-config/free", { modulos: next }); }
    finally { setSavingFree(false); }
  };

  const savePro = async (next) => {
    setProModulos(next);
    setSavingPro(true);
    try { await api.put("/plano-config/pro", { modulos: next }); }
    finally { setSavingPro(false); }
  };

  const savePremium = async (next) => {
    setPremiumModulos(next);
    setSavingPremium(true);
    try { await api.put("/plano-config/premium", { modulos: next }); }
    finally { setSavingPremium(false); }
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
          Defina quais módulos e componentes são visíveis para cada plano. Alterações têm efeito imediato.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 h-96 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PlanColumn
            label="Plano Gratuito"
            accent="bg-slate-400"
            modulos={freeModulos}
            onChange={saveFree}
            saving={savingFree}
          />
          <PlanColumn
            label="Plano Pro"
            accent="bg-violet-600"
            modulos={proModulos}
            onChange={savePro}
            saving={savingPro}
          />
          <PlanColumn
            label="Plano Premium"
            accent="bg-amber-500"
            modulos={premiumModulos}
            onChange={savePremium}
            saving={savingPremium}
          />
        </div>
      )}
    </motion.div>
  );
}
