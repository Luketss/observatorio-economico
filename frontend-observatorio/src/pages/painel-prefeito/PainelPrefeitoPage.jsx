import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { NidPageHeader } from "../../components/nid/Panel";
import KpiCard from "../../components/KpiCard";
import PrioridadesPanel from "../../components/PrioridadesPanel";
import AlertaFpmCard from "../../components/AlertaFpmCard";
import DinheiroNaMesaCard from "../../components/DinheiroNaMesaCard";
import EmendasResumoCard from "../../components/EmendasResumoCard";
import { fmtMoneyShort, fmtNumberShort } from "../../components/nid/charts";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  UserGroupIcon,
  HeartIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtBR = (v, opts = {}) =>
  v != null ? Number(v).toLocaleString("pt-BR", opts) : "—";

function moneyDisplay(v) {
  if (v == null) return { value: "—", unit: "" };
  const a = Math.abs(v);
  if (a >= 1e9) return { value: `R$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Bi" };
  if (a >= 1e6) return { value: `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Mi" };
  if (a >= 1e3) return { value: `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, unit: "k" };
  return { value: `R$ ${fmtBR(v)}`, unit: "" };
}

function kpiDelta(p) {
  if (p == null) return null;
  return { value: Number(p), direction: p > 0 ? "up" : p < 0 ? "down" : "flat" };
}

// strip accents + lowercase for fuzzy area/department matching
function norm(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ── headline metric registry (one per dataset) ──────────────────────────────
// pick(resumo) → { value, unit, delta, foot }
const METRICS = {
  arrecadacao: {
    label: "Arrecadação", route: "/app/arrecadacao",
    pick: (r) => ({ ...moneyDisplay(r?.total_geral), delta: kpiDelta(r?.crescimento_percentual), foot: "vs ano anterior" }),
  },
  pib: {
    label: "PIB", route: "/app/pib",
    pick: (r) => ({ ...moneyDisplay(r?.pib_ultimo_ano), delta: kpiDelta(r?.crescimento_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  vaf: {
    label: "VAF · IPM", route: "/app/vaf",
    pick: (r) => ({ value: r?.ipm_ultimo_ano != null ? fmtBR(r.ipm_ultimo_ano, { maximumFractionDigits: 4 }) : "—", unit: "", delta: kpiDelta(r?.variacao_ipm_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  caged: {
    label: "Saldo CAGED", route: "/app/caged",
    pick: (r) => ({ value: r?.saldo_total != null ? `${r.saldo_total > 0 ? "+" : ""}${fmtBR(r.saldo_total)}` : "—", unit: "vagas", delta: null, foot: r?.total_admissoes != null ? `${fmtBR(r.total_admissoes)} adm.` : "" }),
  },
  rais: {
    label: "Vínculos formais", route: "/app/rais",
    pick: (r) => ({ value: r?.total_vinculos != null ? fmtBR(r.total_vinculos) : "—", unit: "", delta: null, foot: r?.remuneracao_media != null ? `R$ ${fmtBR(r.remuneracao_media, { maximumFractionDigits: 0 })} méd.` : "" }),
  },
  empresas: {
    label: "Empresas ativas", route: "/app/empresas",
    pick: (r) => ({ value: r?.total_ativas != null ? fmtBR(r.total_ativas) : "—", unit: "", delta: null, foot: r?.total_mei != null ? `${fmtBR(r.total_mei)} MEI` : "" }),
  },
  estban: {
    label: "Crédito bancário", route: "/app/estban",
    pick: (r) => ({ ...moneyDisplay(r?.total_operacoes_credito), delta: null, foot: r?.qtd_agencias != null ? `${fmtBR(r.qtd_agencias)} agências` : "" }),
  },
  comex: {
    label: "Balança comercial", route: "/app/comex",
    pick: (r) => ({ value: r?.balanca_comercial != null ? `US$ ${fmtBR(r.balanca_comercial, { maximumFractionDigits: 0 })}` : "—", unit: "", delta: null, foot: "exportação − importação" }),
  },
  pix: {
    label: "Transações PIX", route: "/app/pix",
    pick: (r) => ({ value: r?.total_transacoes != null ? fmtNumberShort(r.total_transacoes) : "—", unit: "", delta: null, foot: "PF + PJ" }),
  },
  bolsa_familia: {
    label: "Bolsa Família", route: "/app/bolsa-familia",
    pick: (r) => ({ value: r?.total_beneficiarios != null ? fmtBR(r.total_beneficiarios) : "—", unit: "famílias", delta: null, foot: r?.valor_total != null ? fmtMoneyShort(r.valor_total) : "" }),
  },
  pe_de_meia: {
    label: "Pé-de-Meia", route: "/app/pe-de-meia",
    pick: (r) => ({ value: r?.total_estudantes != null ? fmtBR(r.total_estudantes) : "—", unit: "estudantes", delta: null, foot: r?.valor_total != null ? fmtMoneyShort(r.valor_total) : "" }),
  },
  inss: {
    label: "Benefícios INSS", route: "/app/inss",
    pick: (r) => ({ value: r?.total_beneficios != null ? fmtBR(r.total_beneficios) : "—", unit: "", delta: null, foot: r?.valor_total != null ? fmtMoneyShort(r.valor_total) : "" }),
  },
  ips: {
    label: "IPS Geral", route: "/app/ips",
    pick: (r) => ({ value: r?.ips_geral != null ? Number(r.ips_geral).toFixed(1) : "—", unit: "/100", delta: null, foot: "Progresso Social" }),
  },
};

const PANORAMA = [
  "arrecadacao", "pib", "vaf", "caged", "rais", "empresas",
  "estban", "comex", "pix", "bolsa_familia", "pe_de_meia", "inss", "ips",
];

// ── secretaria / área config (fixed, standard set) ──────────────────────────
const AREAS = [
  { key: "fazenda", label: "Fazenda & Finanças", icon: BanknotesIcon, datasets: ["arrecadacao", "vaf"], ips: [], aliases: ["fazenda", "financ", "tribut", "arrecada", "receita", "orcamento"] },
  { key: "desenv", label: "Desenvolvimento Econômico", icon: BuildingOffice2Icon, datasets: ["pib", "comex", "empresas", "estban"], ips: [], aliases: ["desenvolvimento", "economic", "industria", "comercio", "turismo", "empreend", "inovac"] },
  { key: "trabalho", label: "Trabalho & Emprego", icon: BriefcaseIcon, datasets: ["caged", "rais"], ips: [], aliases: ["trabalho", "emprego", "renda", "qualifica"] },
  { key: "assistencia", label: "Assistência Social", icon: UserGroupIcon, datasets: ["bolsa_familia", "pe_de_meia", "inss"], ips: [{ field: "necessidades_humanas_basicas", label: "Necessidades básicas" }, { field: "moradia", label: "Moradia" }], aliases: ["assistencia", "social", "cras", "cidadania", "direitos human", "habita"] },
  { key: "saude", label: "Saúde", icon: HeartIcon, datasets: [], ips: [{ field: "saude_bem_estar", label: "Saúde e bem-estar" }, { field: "nutricao_cuidados_medicos", label: "Nutrição e cuidados médicos" }], aliases: ["saude"] },
  { key: "educacao", label: "Educação", icon: AcademicCapIcon, datasets: [], ips: [{ field: "acesso_conhecimento_basico", label: "Conhecimento básico" }, { field: "acesso_educacao_superior", label: "Educação superior" }], aliases: ["educa", "ensino", "escola"] },
  { key: "seguranca", label: "Segurança", icon: ShieldCheckIcon, datasets: [], ips: [{ field: "seguranca_pessoal", label: "Segurança pessoal" }], aliases: ["seguranca", "guarda", "defesa", "transito", "ordem publica"] },
  { key: "meio_ambiente", label: "Meio Ambiente", icon: GlobeAltIcon, datasets: [], ips: [{ field: "qualidade_meio_ambiente", label: "Qualidade do meio ambiente" }], aliases: ["ambiente", "ambiental", "sustentab", "saneamento", "agua", "residuo", "limpeza"] },
];

function matchAreaKey(text) {
  const t = norm(text);
  if (!t) return null;
  const a = AREAS.find((ar) => ar.aliases.some((al) => t.includes(al)));
  return a ? a.key : null;
}

const STATUS_META = {
  nao_iniciado: { label: "Não iniciadas", dot: "bg-slate-400" },
  em_andamento: { label: "Em andamento", dot: "bg-amber-500" },
  concluido: { label: "Concluídas", dot: "bg-green-500" },
};

function statusCounts(acoes) {
  return {
    nao_iniciado: acoes.filter((a) => a.status === "nao_iniciado").length,
    em_andamento: acoes.filter((a) => a.status === "em_andamento").length,
    concluido: acoes.filter((a) => a.status === "concluido").length,
  };
}

// ── small presentational helpers ────────────────────────────────────────────
function StatRow({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-[var(--text-dim)] truncate">{label}</span>
      <span className="text-sm font-semibold text-[var(--text)] whitespace-nowrap">
        {value}
        {unit ? <span className="text-[var(--text-mute)] font-normal text-xs"> {unit}</span> : null}
      </span>
    </div>
  );
}

function IpsRow({ label, score }) {
  const pct = score != null ? Math.max(0, Math.min(100, Number(score))) : null;
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-[var(--text-dim)] truncate">{label}</span>
        <span className="text-sm font-semibold text-[var(--text)] whitespace-nowrap">
          {pct != null ? pct.toFixed(1) : "—"}<span className="text-[var(--text-mute)] font-normal text-xs">/100</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--panel-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: "var(--accent-3)" }} />
      </div>
    </div>
  );
}

function PlanoGovProgress({ acoes }) {
  const c = statusCounts(acoes);
  const total = acoes.length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {Object.entries(STATUS_META).map(([key, meta]) => (
        <span key={key} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-dim)]">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}: <b className="text-[var(--text)]">{c[key]}</b>
        </span>
      ))}
      <span className="text-xs text-[var(--text-mute)]">· {total} ações</span>
    </div>
  );
}

const SectionTitle = ({ children }) => (
  <h3 className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--text-mute)] mb-3">{children}</h3>
);

// ── area card ────────────────────────────────────────────────────────────────
function AreaCard({ area, resumo, ips, indicadores, acoes }) {
  const Icon = area.icon;
  const internas = (indicadores || []).slice(0, 4);
  const extras = (indicadores || []).length - internas.length;
  const hasAny =
    area.datasets.length > 0 ||
    area.ips.length > 0 ||
    (indicadores || []).length > 0 ||
    (acoes || []).length > 0;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-xl bg-[var(--panel-2)]">
          <Icon className="w-5 h-5 text-[var(--accent-1)]" />
        </div>
        <h2 className="text-base font-bold text-[var(--text)]">{area.label}</h2>
      </div>

      {!hasAny && (
        <p className="text-sm text-[var(--text-mute)]">Sem dados disponíveis para esta área.</p>
      )}

      {area.datasets.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Indicadores federais</SectionTitle>
          {area.datasets.map((dk) => {
            const m = METRICS[dk];
            const p = m.pick(resumo[dk]);
            return (
              <Link key={dk} to={m.route} className="block hover:opacity-80 transition-opacity">
                <StatRow label={m.label} value={p.value} unit={p.unit} />
              </Link>
            );
          })}
        </div>
      )}

      {area.ips.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Progresso social (IPS)</SectionTitle>
          {area.ips.map((row) => (
            <IpsRow key={row.field} label={row.label} score={ips ? ips[row.field] : null} />
          ))}
        </div>
      )}

      {internas.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Indicadores do município</SectionTitle>
          {internas.map((ind) => (
            <StatRow key={ind.id} label={ind.nome_metrica} value={fmtBR(ind.valor)} unit={ind.unidade} />
          ))}
          {extras > 0 && (
            <Link to="/app/dados-internos/indicadores" className="text-xs text-[var(--accent-3)] hover:opacity-80">
              +{extras} indicador(es)
            </Link>
          )}
        </div>
      )}

      {(acoes || []).length > 0 && (
        <div>
          <SectionTitle>Plano de governo</SectionTitle>
          <PlanoGovProgress acoes={acoes} />
        </div>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────
export default function PainelPrefeitoPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [resumo, setResumo] = useState({});
  const [ips, setIps] = useState(null);
  const [indicadores, setIndicadores] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const safeGet = (url) => api.get(url).then((r) => r.data).catch(() => null);
    Promise.all([
      safeGet("/arrecadacao/resumo"),
      safeGet("/pib/resumo"),
      safeGet("/vaf/resumo"),
      safeGet("/caged/resumo"),
      safeGet("/rais/resumo"),
      safeGet("/empresas/resumo"),
      safeGet("/estban/resumo"),
      safeGet("/comex/resumo"),
      safeGet("/pix/resumo"),
      safeGet("/bolsa_familia/resumo"),
      safeGet("/pe_de_meia/resumo"),
      safeGet("/inss/resumo"),
      safeGet("/ips/scorecard"),
      safeGet("/dados_internos/indicadores"),
      safeGet("/dados_internos/plano_gov"),
    ]).then((res) => {
      if (!alive) return;
      const [arr, pib, vaf, caged, rais, emp, estban, comex, pix, bf, pdm, inss, ipsRes, inds, plano] = res;
      setResumo({
        arrecadacao: arr, pib, vaf, caged, rais, empresas: emp,
        estban, comex, pix, bolsa_familia: bf, pe_de_meia: pdm, inss, ips: ipsRes,
      });
      setIps(ipsRes || null);
      setIndicadores(Array.isArray(inds) ? inds : []);
      setAcoes(Array.isArray(plano) ? plano : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [needsMunicipio]);

  const indByArea = useMemo(() => {
    const map = {};
    indicadores.forEach((ind) => {
      const k = matchAreaKey(ind.area) || "outras";
      (map[k] = map[k] || []).push(ind);
    });
    return map;
  }, [indicadores]);

  const planoByArea = useMemo(() => {
    const map = {};
    acoes.forEach((ac) => {
      const k = matchAreaKey(ac.departamento) || "outras";
      (map[k] = map[k] || []).push(ac);
    });
    return map;
  }, [acoes]);

  const outrasInds = indByArea.outras || [];
  const outrasAcoes = planoByArea.outras || [];

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Painel do Prefeito" sub="Visão executiva de todas as áreas do município" />
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <NidPageHeader title="Painel do Prefeito" sub="Visão executiva de todas as áreas do município" />

      {/* AI priorities */}
      <div className="mt-4 mb-7">
        <PrioridadesPanel />
      </div>

      {/* Alerta de faixa do FPM */}
      <div className="mb-7">
        <AlertaFpmCard />
      </div>

      {/* Captação federal + emendas (teasers livres) */}
      <div className="mb-7 space-y-4">
        <DinheiroNaMesaCard />
        <EmendasResumoCard />
      </div>

      {/* Panorama — all headline metrics */}
      <SectionTitle>Panorama geral</SectionTitle>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-9">
          {[...Array(8)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-9">
          {PANORAMA.map((key, i) => {
            const m = METRICS[key];
            const p = m.pick(resumo[key]);
            return (
              <Link key={key} to={m.route} className="block">
                <KpiCard
                  label={m.label}
                  value={p.value}
                  unit={p.unit}
                  delta={p.delta}
                  sub={p.foot}
                  delay={i * 0.03}
                />
              </Link>
            );
          })}
        </div>
      )}

      {/* Por secretaria / área */}
      <SectionTitle>Por secretaria / área</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {AREAS.map((area) => (
          <AreaCard
            key={area.key}
            area={area}
            resumo={resumo}
            ips={ips}
            indicadores={indByArea[area.key]}
            acoes={planoByArea[area.key]}
          />
        ))}

        {(outrasInds.length > 0 || outrasAcoes.length > 0) && (
          <AreaCard
            area={{ key: "outras", label: "Outras áreas", icon: Squares2X2Icon, datasets: [], ips: [], aliases: [] }}
            resumo={resumo}
            ips={ips}
            indicadores={outrasInds}
            acoes={outrasAcoes}
          />
        )}
      </div>
    </motion.div>
  );
}
