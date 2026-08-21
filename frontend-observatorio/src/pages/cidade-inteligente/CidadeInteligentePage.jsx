import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { useToast } from "../../context/ToastContext";
import { usePermissao } from "../../hooks/usePermissao";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import api from "../../services/api";
import { NidPageHeader } from "../../components/nid/Panel";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import CertificacaoDrawer from "./CertificacaoDrawer";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

const defaultForm = { nome: "", entidade: "", descricao: "" };

export default function CidadeInteligentePage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const { addToast } = useToast();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const needsMunicipio = isGlobal && viewAsId == null;
  const canCriar = usePermissao("cidade_inteligente", "criar") && !isGlobal;

  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState(null); // id da certificação no drawer
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [salvando, setSalvando] = useState(false);

  const recarregar = () => {
    api.get("/cidade-inteligente/certificacoes")
      .then((r) => setCerts(r.data || []))
      .catch(() => setCerts([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (needsMunicipio) return;
    recarregar();
  }, [needsMunicipio]);

  const fecharDrawer = () => { setAberta(null); recarregar(); };

  function abrirForm() {
    setForm(defaultForm);
    setSalvando(false);
    setCriando(true);
  }
  function fecharForm() {
    setCriando(false);
    setForm(defaultForm);
  }

  useEscapeKey(useCallback(() => {
    if (criando) { fecharForm(); return; }
    if (aberta != null) fecharDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criando, aberta]));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) { addToast("Informe o nome da certificação", "error"); return; }
    setSalvando(true);
    try {
      await api.post("/cidade-inteligente/certificacoes", {
        nome: form.nome,
        entidade: form.entidade || null,
        descricao: form.descricao || null,
      });
      addToast("Certificação criada", "success");
      fecharForm();
      recarregar();
    } catch (err) {
      addToast(err?.response?.data?.detail || "Erro ao criar certificação", "error");
    } finally {
      setSalvando(false);
    }
  }

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Cidade Inteligente" sub="Certificações e selos que o município acompanha." />
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <NidPageHeader title="Cidade Inteligente" sub="Certificações e selos que o município acompanha." />

      <div className="flex justify-end mb-4">
        {canCriar && (
          <button
            type="button"
            onClick={abrirForm}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Nova certificação
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : certs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Nenhuma certificação cadastrada ainda.</p>
          {canCriar && <p className="text-xs mt-1">Clique em "Nova certificação" para começar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {certs.map((cert) => {
            const pct = (cert.atendidos / cert.total) * 100 || 0;
            return (
              <div key={cert.id} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-3">
                <div
                  className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  {...propsTituloClicavel(() => setAberta(cert.id))}
                >
                  {cert.entidade && <p className="text-[11px] uppercase tracking-wider text-slate-400">{cert.entidade}</p>}
                  <h4 className="font-semibold text-[var(--text)] text-sm leading-snug">{cert.nome}</h4>
                </div>

                <div>
                  <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-5)" }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">{cert.atendidos} de {cert.total} atendidos</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {cert.em_andamento > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ color: "var(--accent-4)", background: "color-mix(in oklab, var(--accent-4) 14%, transparent)" }}
                    >
                      {cert.em_andamento} em andamento
                    </span>
                  )}
                  {cert.pendentes > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ color: "var(--text-mute)", background: "var(--panel-2)" }}
                    >
                      {cert.pendentes} pendente{cert.pendentes > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setAberta(cert.id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Ver detalhes
                </button>
              </div>
            );
          })}
        </div>
      )}

      {criando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) fecharForm(); }}
        >
          <div className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[var(--text)]">Nova certificação</h3>
              <button
                type="button"
                onClick={fecharForm}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Nome *</label>
                <input
                  value={form.nome}
                  required
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Entidade</label>
                <input
                  value={form.entidade}
                  onChange={(e) => setForm((p) => ({ ...p, entidade: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Descrição</label>
                <textarea
                  rows={3}
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={fecharForm}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                >
                  {salvando ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CertificacaoDrawer certId={aberta} onClose={fecharDrawer} />
    </motion.div>
  );
}
