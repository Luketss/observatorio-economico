import { useEffect, useMemo, useState, useCallback, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { usePermissao } from "../../hooks/usePermissao";
import { useViewAs } from "../../context/ViewAsContext";
import { PlanContext } from "../../context/PlanContext";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import NidSelect from "../../components/nid/NidSelect";
import NidTabBar from "../../components/nid/NidTabBar";
import PlanGate from "../../components/PlanGate";
import DescobrirRfb from "./DescobrirRfb";
import EmpresaDrawer from "./EmpresaDrawer";
import BuscaEmpresaRfb from "./BuscaEmpresaRfb";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

const RISCO_CONFIG = {
  baixo:  { label: "Risco baixo",  color: "bg-[var(--panel-2)] text-green-400" },
  medio:  { label: "Risco médio",  color: "bg-[var(--panel-2)] text-amber-400" },
  alto:   { label: "Risco alto",   color: "bg-[var(--panel-2)] text-red-400" },
};

const EXPANSAO_CONFIG = {
  baixo:  { label: "Expansão baixa",  color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  medio:  { label: "Expansão média",  color: "bg-[var(--panel-2)] text-amber-400" },
  alto:   { label: "Expansão alta",   color: "bg-[var(--panel-2)] text-blue-400" },
};

// Relevância e risco calculados no backend (derivados na leitura). Tons por
// tokens: alta accent-5, média accent-4, baixa text-dim; sinais em accent-4,
// accent-2 quando o nível é alto ou a empresa está baixada na RFB.
const FAIXA_CONFIG = {
  alta:  { label: "Alta",  color: "var(--accent-5)" },
  media: { label: "Média", color: "var(--accent-4)" },
  baixa: { label: "Baixa", color: "var(--text-dim)" },
};
const SINAL_LABEL = {
  proxima_acao_vencida: "Ação vencida",
  sem_contato_90d: "Sem contato 90d+",
  demanda_aberta_30d: "Demanda aberta 30d+",
  rfb_irregular: "RFB irregular",
  rfb_baixada: "RFB baixada",
};
const NIVEL_ORDEM = { alto: 0, atencao: 1, nenhum: 2 };
const normalizar = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// "Em risco" = avaliação manual alta OU nível calculado alto.
const emRisco = (e) => e.status_risco === "alto" || e.risco?.nivel === "alto";
const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
const score = (e) => e.relevancia?.score ?? 0;

function ChipRelevancia({ relevancia }) {
  if (!relevancia) return null;
  const faixa = FAIXA_CONFIG[relevancia.faixa] || FAIXA_CONFIG.baixa;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--panel-2)]"
      style={{ color: faixa.color }}
      title={relevancia.parcial ? "sem vínculo com a base RFB" : undefined}
    >
      Relevância {relevancia.score} · {faixa.label}{relevancia.parcial ? " · parcial" : ""}
    </span>
  );
}

function ChipsSinais({ risco }) {
  if (!risco?.sinais?.length) return null;
  return risco.sinais.map((s) => (
    <span
      key={s.chave}
      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--panel-2)]"
      style={{ color: risco.nivel === "alto" || s.chave === "rfb_baixada" ? "var(--accent-2)" : "var(--accent-4)" }}
    >
      {SINAL_LABEL[s.chave] || s.rotulo}
    </span>
  ));
}

const defaultForm = {
  nome: "",
  cnpj: "",
  cnpj_basico: null,
  setor: "",
  num_empregos: "",
  status_risco: "baixo",
  potencial_expansao: "baixo",
  responsavel: "",
};

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function GestaoEmpresarialTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { canAccess } = useContext(PlanContext);
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const { viewAsId } = useViewAs();
  const needsMunicipio = isGlobal && viewAsId == null;
  // ADMIN_GLOBAL não cria aqui: o registro nasce no município do usuário.
  const canCriar = usePermissao("retencao", "criar") && !isGlobal;
  const canEditar = usePermissao("retencao", "editar") && !isGlobal;
  const canExcluir = usePermissao("retencao", "excluir") && !isGlobal;

  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingEmpresa, setViewingEmpresa] = useState(null);
  const [detalhe, setDetalhe] = useState({});

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Abas: 0 = Acompanhadas (o que existe), 1 = Descobrir na base RFB.
  const [aba, setAba] = useState(0);
  // Incrementado ao salvar um cadastro: a empresa some do ranking da descoberta.
  const [refreshDescoberta, setRefreshDescoberta] = useState(0);

  // Busca, ordenação e filtro no cliente sobre a lista já carregada (a ordem
  // inicial do backend já é a de relevância; reordenar aqui mantém a regra
  // visível mesmo com mocks/listas antigas).
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("relevancia"); // relevancia | nome | risco
  const [filtro, setFiltro] = useState("todas");    // todas | risco | alta | sem_rfb

  const visiveis = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = empresas.filter((e) => {
      if (q && !normalizar(e.nome).includes(q) && !normalizar(e.setor).includes(q)) return false;
      if (filtro === "risco") return emRisco(e);
      if (filtro === "alta") return e.relevancia?.faixa === "alta";
      if (filtro === "sem_rfb") return Boolean(e.relevancia?.parcial);
      return true;
    });
    if (ordem === "nome") return [...lista].sort(porNome);
    if (ordem === "risco") {
      return [...lista].sort((a, b) =>
        (NIVEL_ORDEM[a.risco?.nivel] ?? 2) - (NIVEL_ORDEM[b.risco?.nivel] ?? 2) || score(b) - score(a) || porNome(a, b));
    }
    return [...lista].sort((a, b) => score(b) - score(a) || porNome(a, b));
  }, [empresas, busca, ordem, filtro]);

  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingEmpresa) { setViewingEmpresa(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingEmpresa, showForm]));

  async function load() {
    try {
      const res = await api.get("/desenvolvimento-economico/retencao");
      setEmpresas(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetalhe(id) {
    try {
      const res = await api.get(`/desenvolvimento-economico/retencao/${id}`);
      setDetalhe((prev) => ({ ...prev, [id]: res.data }));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (needsMunicipio) return;
    load();
  }, [needsMunicipio]);

  function abrirEmpresa(empresa) {
    setViewingEmpresa(empresa);
    if (!detalhe[empresa.id]) loadDetalhe(empresa.id);
  }

  // `prefill` vem do "Acompanhar" da descoberta: nome, vínculo RFB e setor
  // (divisão CNAE) já preenchidos; o gestor completa o resto antes de salvar.
  function openCreate(prefill = null) {
    setEditingId(null);
    setForm(prefill ? { ...defaultForm, ...prefill } : defaultForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(e) {
    setEditingId(e.id);
    setForm({
      nome: e.nome,
      cnpj: e.cnpj || "",
      cnpj_basico: e.cnpj_basico || null,
      setor: e.setor || "",
      num_empregos: e.num_empregos != null ? String(e.num_empregos) : "",
      status_risco: e.status_risco,
      potencial_expansao: e.potencial_expansao,
      responsavel: e.responsavel || "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = { ...form, num_empregos: form.num_empregos ? Number(form.num_empregos) : null };
    try {
      if (editingId) {
        await api.put(`/desenvolvimento-economico/retencao/${editingId}`, payload);
        addToast("Empresa atualizada", "success");
      } else {
        await api.post("/desenvolvimento-economico/retencao", payload);
        addToast("Empresa adicionada", "success");
      }
      closeForm();
      await load();
      setRefreshDescoberta((n) => n + 1);
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/desenvolvimento-economico/retencao/${id}`);
      setDeleteConfirmId(null);
      setViewingEmpresa(null);
      setDetalhe((prev) => { const n = { ...prev }; delete n[id]; return n; });
      addToast("Empresa removida", "success");
      await load();
    } catch {
      addToast("Erro ao excluir", "error");
    }
  }

  const kpis = {
    total: empresas.length,
    emRisco: empresas.filter(emRisco).length,
    altaRelevancia: empresas.filter((e) => e.relevancia?.faixa === "alta").length,
    altoExpansao: empresas.filter((e) => e.potencial_expansao === "alto").length,
    totalEmpregos: empresas.reduce((s, e) => s + (e.num_empregos || 0), 0),
  };

  const header = (
    <div className="flex items-center gap-3">
      <BuildingOffice2Icon className="w-7 h-7 text-blue-600" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Gestão Empresarial
        </h1>
        <p className="text-xs mt-0.5 text-[var(--text-dim)]">Relacionamento com empresas — perfil, contatos, demandas, retenção e expansão.</p>
      </div>
    </div>
  );

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {header}
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {header}
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {header}
      <NidTabBar
        tabs={["Acompanhadas", "Descobrir na base RFB"]}
        value={aba}
        onChange={setAba}
        ariaLabel="Seções da Gestão Empresarial"
      />

      {aba === 1 && (
        <PlanGate planKey="empresas">
          {canAccess("empresas") ? (
            <DescobrirRfb
              canCriar={canCriar}
              refreshKey={refreshDescoberta}
              onAcompanhar={(e) => openCreate({
                nome: e.razao_social,
                cnpj_basico: e.cnpj_basico,
                setor: e.divisao_descricao || "",
              })}
            />
          ) : (
            // Sem o plano, nada é montado (nem chamada à API); o cadeado do
            // PlanGate aparece sobre este espaço.
            <div className="h-40" aria-hidden="true" />
          )}
        </PlanGate>
      )}

      {aba === 0 && (<>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: "Total de empresas", value: kpis.total, color: "text-[var(--text)]" },
          { label: "Em risco", value: kpis.emRisco, color: "text-red-600" },
          { label: "Alta relevância", value: kpis.altaRelevancia, color: "text-[var(--accent-5)]" },
          { label: "Alto potencial", value: kpis.altoExpansao, color: "text-blue-600" },
          { label: "Total empregos", value: kpis.totalEmpregos.toLocaleString("pt-BR"), color: "text-green-600" },
        ].map((k) => (
          <div key={k.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar: busca, ordenação e filtro (cliente) + Nova Empresa */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Buscar empresa"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou setor…"
          className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--panel)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] min-w-[220px]"
        />
        <NidSelect value={ordem} onChange={(e) => setOrdem(e.target.value)} ariaLabel="Ordenar por">
          <option value="relevancia">Relevância</option>
          <option value="nome">Nome</option>
          <option value="risco">Risco</option>
        </NidSelect>
        <NidSelect value={filtro} onChange={(e) => setFiltro(e.target.value)} ariaLabel="Filtrar empresas">
          <option value="todas">Todas</option>
          <option value="risco">Em risco</option>
          <option value="alta">Alta relevância</option>
          <option value="sem_rfb">Sem vínculo RFB</option>
        </NidSelect>
        {canCriar && (
          <button
            onClick={() => openCreate()}
            className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Nova Empresa
          </button>
        )}
      </div>

      {/* Company cards */}
      {empresas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma empresa monitorada ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Nova Empresa" para começar.</p>}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma empresa corresponde ao filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((empresa) => {
            const risco = RISCO_CONFIG[empresa.status_risco] || RISCO_CONFIG.baixo;
            const expansao = EXPANSAO_CONFIG[empresa.potencial_expansao] || EXPANSAO_CONFIG.baixo;
            return (
              <div key={empresa.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-hidden">
                {/* Card header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4
                        className="font-semibold text-[var(--text)] text-sm leading-snug cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        {...propsTituloClicavel(() => abrirEmpresa(empresa))}
                      >
                        {empresa.nome}
                      </h4>
                      {empresa.setor && <p className="text-xs text-slate-400 mt-0.5">{empresa.setor}</p>}
                    </div>
                    {(canEditar || canExcluir) && (
                      <div className="flex gap-1 shrink-0">
                        {canEditar && (
                          <button onClick={() => openEdit(empresa)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canExcluir && (
                          <button onClick={() => setDeleteConfirmId(empresa.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <ChipRelevancia relevancia={empresa.relevancia} />
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
                    <ChipsSinais risco={empresa.risco} />
                  </div>

                  {empresa.num_empregos != null && (
                    <p className="text-xs text-slate-400">{empresa.num_empregos.toLocaleString("pt-BR")} emprego(s)</p>
                  )}

                  {empresa.proxima_acao && (
                    <p className="text-xs text-slate-400">
                      <span className="font-medium text-[var(--text-dim)]">Próxima ação:</span> {empresa.proxima_acao}
                      {empresa.proxima_acao_data && ` · ${fmtDate(empresa.proxima_acao_data)}`}
                    </p>
                  )}

                  <button
                    onClick={() => abrirEmpresa(empresa)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}

      {/* Detail drawer */}
      <EmpresaDrawer
        empresa={viewingEmpresa}
        detalhe={viewingEmpresa ? detalhe[viewingEmpresa.id] : null}
        onClose={() => setViewingEmpresa(null)}
        onChanged={async (id) => { await loadDetalhe(id); await load(); }}
        canEditar={canEditar}
      />

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
            >
              <h3 className="font-bold text-[var(--text)]">Excluir empresa?</h3>
              <p className="text-sm text-[var(--text-dim)]">Todas as visitas também serão removidas.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm cursor-pointer">Excluir</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-[var(--text)]">
                  {editingId ? "Editar Empresa" : "Nova Empresa"}
                </h3>
                <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Nome *</label>
                  <input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {canAccess("empresas") && (
                  <div className="md:col-span-2 flex flex-col gap-1">
                    <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Vínculo com a base CNPJ</label>
                    {form.cnpj_basico ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-[var(--panel-2)] text-green-400">
                          Vinculada · {form.cnpj_basico}
                        </span>
                        <button type="button" onClick={() => setForm((p) => ({ ...p, cnpj_basico: null }))}
                          className="text-xs text-red-500 hover:text-red-600 cursor-pointer">Desvincular</button>
                      </div>
                    ) : (
                      <BuscaEmpresaRfb onSelect={(e) => setForm((p) => ({
                        ...p,
                        cnpj_basico: e.cnpj_basico,
                        nome: p.nome || e.razao_social,
                      }))} />
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Setor</label>
                  <input value={form.setor} onChange={(e) => setForm((p) => ({ ...p, setor: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Empregos</label>
                  <input type="number" value={form.num_empregos} onChange={(e) => setForm((p) => ({ ...p, num_empregos: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Risco de saída</label>
                  <select value={form.status_risco} onChange={(e) => setForm((p) => ({ ...p, status_risco: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(RISCO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Potencial de expansão</label>
                  <select value={form.potencial_expansao} onChange={(e) => setForm((p) => ({ ...p, potencial_expansao: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(EXPANSAO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  {formError && <p className="text-sm text-red-600 flex-1">{formError}</p>}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                      {saving ? "Salvando..." : editingId ? "Salvar" : "Adicionar"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
