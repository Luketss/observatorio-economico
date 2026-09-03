import { useState } from "react";
import { CameraIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import NidDrawer from "../../components/nid/NidDrawer";
import NidTabBar from "../../components/nid/NidTabBar";
import PlanGate from "../../components/PlanGate";

const RISCO_CONFIG = {
  baixo: { label: "Risco baixo", color: "bg-[var(--panel-2)] text-green-400" },
  medio: { label: "Risco médio", color: "bg-[var(--panel-2)] text-amber-400" },
  alto: { label: "Risco alto", color: "bg-[var(--panel-2)] text-red-400" },
};
const EXPANSAO_CONFIG = {
  baixo: { label: "Expansão baixa", color: "bg-[var(--panel-2)] text-[var(--text-dim)]" },
  medio: { label: "Expansão média", color: "bg-[var(--panel-2)] text-amber-400" },
  alto: { label: "Expansão alta", color: "bg-[var(--panel-2)] text-blue-400" },
};
const TIPO_CONTATO = { reuniao: "Reunião", ligacao: "Ligação", email: "E-mail", visita_tecnica: "Visita técnica", outro: "Outro" };
const STATUS_DEMANDA = {
  aberta: { label: "Aberta", cls: "bg-[var(--panel-2)] text-amber-400" },
  em_andamento: { label: "Em andamento", cls: "bg-[var(--panel-2)] text-blue-400" },
  resolvida: { label: "Resolvida", cls: "bg-[var(--panel-2)] text-green-400" },
};
const PORTE_RFB = { "00": "Não informado", "01": "Micro", "03": "Pequena", "05": "Média", "07": "Grande" };
const SITUACAO_RFB = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
const FAIXA_CONFIG = {
  alta:  { label: "Alta",  color: "var(--accent-5)" },
  media: { label: "Média", color: "var(--accent-4)" },
  baixa: { label: "Baixa", color: "var(--text-dim)" },
};
const NIVEL_LABEL = { alto: "alto", atencao: "atenção", nenhum: "nenhum" };
const ABAS = ["Perfil", "Contatos & Visitas", "Demandas"];

const inputCls = "w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const rotuloStatus = (s) => STATUS_DEMANDA[s]?.label || s;
// "Status desde": última transição do histórico; demandas anteriores à
// migração 0041 não têm histórico e caem na data de registro.
const statusDesde = (d) => (d.historico?.length ? d.historico[d.historico.length - 1].alterado_em.slice(0, 10) : d.data_registro);

const defaultContato = { data: "", tipo: "reuniao", responsavel: "", observacoes: "" };
const defaultVisita = { data_visita: "", responsavel: "", observacoes: "", foto_base64: "" };
const defaultDemanda = { descricao: "", data_registro: "", responsavel: "" };

// Linha "rótulo …… pontos/máximo". Fator de cadastro zerado por dado ausente
// vira dica; o modificador de situação (maximo 0) mostra só os pontos.
function LinhaFator({ f }) {
  const dica = f.chave === "empregos" && f.pontos === 0 ? " — informe os empregos para refinar" : "";
  return (
    <li className="flex justify-between gap-2 text-xs">
      <span className="text-[var(--text-dim)]">{f.rotulo}{dica}</span>
      <span className="text-[var(--text)] tabular-nums shrink-0">{f.maximo > 0 ? `${f.pontos}/${f.maximo}` : String(f.pontos)}</span>
    </li>
  );
}

// Score, faixa, barra e fatores de cadastro. Os fatores RFB ficam na seção
// Base RFB (sob o PlanGate "empresas" já existente) — ver FatoresRfb.
function BlocoRelevancia({ relevancia }) {
  if (!relevancia) return null;
  const faixa = FAIXA_CONFIG[relevancia.faixa] || FAIXA_CONFIG.baixa;
  const cadastro = relevancia.fatores.filter((f) => f.origem === "cadastro");
  return (
    <section aria-label="Relevância" className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Relevância</p>
        <span className="text-xl font-extrabold" style={{ color: faixa.color }}>{relevancia.score}</span>
        <span className="text-xs" style={{ color: faixa.color }}>{faixa.label}{relevancia.parcial ? " · parcial" : ""}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden" role="progressbar"
        aria-valuenow={relevancia.score} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${relevancia.score}%`, background: faixa.color }} />
      </div>
      <ul className="space-y-1">{cadastro.map((f) => <LinhaFator key={f.chave} f={f} />)}</ul>
      {relevancia.parcial && (
        <p className="text-xs text-slate-400">parcial — vincule à base RFB no formulário de edição.</p>
      )}
    </section>
  );
}

function FatoresRfb({ relevancia }) {
  const rfb = relevancia?.fatores?.filter((f) => f.origem === "rfb") ?? [];
  if (rfb.length === 0) return null;
  return (
    <div className="pt-2 space-y-1">
      <p className="text-[11px] text-slate-400 uppercase tracking-wider">Na relevância</p>
      <ul className="space-y-1">{rfb.map((f) => <LinhaFator key={f.chave} f={f} />)}</ul>
    </div>
  );
}

function BlocoSinais({ risco }) {
  if (!risco) return null;
  return (
    <section aria-label="Sinais de risco" className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-1.5">
      <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
        Sinais de risco{risco.nivel !== "nenhum" && ` · ${NIVEL_LABEL[risco.nivel] || risco.nivel}`}
      </p>
      {risco.sinais.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum sinal de risco calculado.</p>
      ) : (
        <ul className="space-y-1">
          {risco.sinais.map((s) => (
            <li key={s.chave} className="text-xs text-[var(--text)]">
              {s.rotulo}{s.desde && <span className="text-slate-400"> · desde {fmtDate(s.desde)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function EmpresaDrawer({ empresa, detalhe, onClose, onChanged, canEditar }) {
  const { addToast } = useToast();
  const [aba, setAba] = useState(0);
  const [contatoForm, setContatoForm] = useState(defaultContato);
  const [visitaForm, setVisitaForm] = useState(defaultVisita);
  const [demandaForm, setDemandaForm] = useState(defaultDemanda);
  const [editingDemandaId, setEditingDemandaId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [acaoForm, setAcaoForm] = useState(null); // null = exibindo; {proxima_acao, proxima_acao_data} = editando
  const [historicoAberto, setHistoricoAberto] = useState({}); // { [demandaId]: bool }

  const det = detalhe;
  const risco = empresa ? RISCO_CONFIG[empresa.status_risco] || RISCO_CONFIG.baixo : null;
  const expansao = empresa ? EXPANSAO_CONFIG[empresa.potencial_expansao] || EXPANSAO_CONFIG.baixo : null;
  const fotoHero = det?.visitas?.find((v) => v.foto_base64)?.foto_base64 || null;
  const proximaAcao = det ? det.proxima_acao : (empresa?.proxima_acao ?? null);
  const proximaAcaoData = det ? det.proxima_acao_data : (empresa?.proxima_acao_data ?? null);
  // Enquanto o detalhe não chegou, o card já traz relevância/risco (LeanOut).
  const relevancia = det?.relevancia ?? empresa?.relevancia ?? null;
  const riscoCalc = det?.risco ?? empresa?.risco ?? null;

  async function chamar(fn, okMsg, errMsg) {
    setSalvando(true);
    try {
      await fn();
      addToast(okMsg, "success");
      onChanged(empresa.id);
    } catch {
      addToast(errMsg, "error");
    } finally {
      setSalvando(false);
    }
  }

  const addContato = () => {
    if (!contatoForm.data) { addToast("Informe a data do contato", "error"); return; }
    chamar(async () => {
      await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/contatos`, {
        ...contatoForm,
        responsavel: contatoForm.responsavel || null,
        observacoes: contatoForm.observacoes || null,
      });
      setContatoForm(defaultContato);
    }, "Contato registrado", "Erro ao registrar contato");
  };

  const addVisita = () => {
    if (!visitaForm.data_visita) { addToast("Informe a data da visita", "error"); return; }
    chamar(async () => {
      await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/visitas`, {
        ...visitaForm, foto_base64: visitaForm.foto_base64 || null,
      });
      setVisitaForm(defaultVisita);
    }, "Visita registrada", "Erro ao registrar visita");
  };

  const addDemanda = () => {
    if (!demandaForm.descricao || !demandaForm.data_registro) {
      addToast("Informe descrição e data da demanda", "error"); return;
    }
    const payload = { ...demandaForm, responsavel: demandaForm.responsavel || null };
    chamar(async () => {
      if (editingDemandaId) {
        await api.put(`/desenvolvimento-economico/retencao/demandas/${editingDemandaId}`, payload);
      } else {
        await api.post(`/desenvolvimento-economico/retencao/${empresa.id}/demandas`, payload);
      }
      setDemandaForm(defaultDemanda);
      setEditingDemandaId(null);
    }, editingDemandaId ? "Demanda atualizada" : "Demanda registrada", "Erro ao salvar demanda");
  };

  const mudarStatusDemanda = (demanda, status) =>
    chamar(() => api.put(`/desenvolvimento-economico/retencao/demandas/${demanda.id}`, { status }),
      "Status atualizado", "Erro ao atualizar demanda");

  const excluir = (rota, okMsg) =>
    chamar(() => api.delete(rota), okMsg, "Erro ao excluir");

  const salvarAcao = () =>
    chamar(async () => {
      await api.put(`/desenvolvimento-economico/retencao/${empresa.id}`, {
        proxima_acao: acaoForm.proxima_acao || null,
        proxima_acao_data: acaoForm.proxima_acao_data || null,
      });
      setAcaoForm(null);
    }, "Próxima ação salva", "Erro ao salvar");

  function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setVisitaForm((p) => ({ ...p, foto_base64: ev.target.result }));
    reader.readAsDataURL(file);
  }

  const timeline = det
    ? [
        ...(det.visitas || []).map((v) => ({ kind: "visita", data: v.data_visita, item: v })),
        ...(det.contatos || []).map((c) => ({ kind: "contato", data: c.data, item: c })),
      ].sort((a, b) => (a.data < b.data ? -1 : 1))
    : null;

  return (
    <NidDrawer
      open={!!empresa}
      onClose={onClose}
      ariaLabel={empresa ? `Detalhes da empresa ${empresa.nome}` : "Detalhes da empresa"}
      hero={fotoHero && (
        <img src={fotoHero} alt={`Foto de visita a ${empresa.nome}`}
          style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
      )}
    >
      {empresa && (
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{empresa.nome}</h2>
            {empresa.setor && <p className="text-xs text-slate-400 mt-1">{empresa.setor}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
          </div>

          {/* Próxima ação */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Próxima ação</p>
            {acaoForm ? (
              <div className="space-y-2">
                <input aria-label="Próxima ação" value={acaoForm.proxima_acao}
                  onChange={(e) => setAcaoForm((p) => ({ ...p, proxima_acao: e.target.value }))}
                  className={inputCls} />
                <input aria-label="Data da próxima ação" type="date" value={acaoForm.proxima_acao_data}
                  onChange={(e) => setAcaoForm((p) => ({ ...p, proxima_acao_data: e.target.value }))}
                  className={inputCls} />
                <div className="flex gap-2">
                  <button type="button" onClick={salvarAcao} disabled={salvando}
                    className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => setAcaoForm(null)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[var(--text)]">
                  {proximaAcao
                    ? <>{proximaAcao}{proximaAcaoData && <span className="text-slate-400"> · {fmtDate(proximaAcaoData)}</span>}</>
                    : <span className="text-slate-400">Nenhuma ação planejada.</span>}
                </p>
                {canEditar && (
                  <button type="button"
                    onClick={() => setAcaoForm({
                      proxima_acao: proximaAcao || "",
                      proxima_acao_data: proximaAcaoData || "",
                    })}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 cursor-pointer">Editar</button>
                )}
              </div>
            )}
          </div>

          <NidTabBar tabs={ABAS} value={aba} onChange={setAba} ariaLabel="Seções da empresa" />

          {/* ── Aba Perfil ── */}
          {aba === 0 && (
            <div className="space-y-3">
              <BlocoRelevancia relevancia={relevancia} />
              <BlocoSinais risco={riscoCalc} />
              {empresa.num_empregos != null && (
                <p className="text-xs text-slate-400">{empresa.num_empregos.toLocaleString("pt-BR")} emprego(s)</p>
              )}
              {empresa.responsavel && (
                <p className="text-xs text-slate-400">Responsável: {empresa.responsavel}</p>
              )}
              <PlanGate planKey="empresas">
                <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Base RFB</p>
                  {det?.perfil_rfb ? (
                    <dl className="text-xs text-[var(--text-dim)] space-y-1">
                      <div><dt className="inline text-slate-400">Razão social: </dt><dd className="inline text-[var(--text)]">{det.perfil_rfb.razao_social}</dd></div>
                      {det.perfil_rfb.nome_fantasia && <div><dt className="inline text-slate-400">Nome fantasia: </dt><dd className="inline">{det.perfil_rfb.nome_fantasia}</dd></div>}
                      <div><dt className="inline text-slate-400">Situação: </dt><dd className="inline">{SITUACAO_RFB[det.perfil_rfb.situacao] || det.perfil_rfb.situacao || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">Porte: </dt><dd className="inline">{PORTE_RFB[det.perfil_rfb.porte] || det.perfil_rfb.porte || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">CNAE: </dt><dd className="inline">{det.perfil_rfb.cnae_fiscal || "—"}</dd></div>
                      <div><dt className="inline text-slate-400">Capital social: </dt><dd className="inline">{fmtBRL(det.perfil_rfb.capital_social)}</dd></div>
                      <div><dt className="inline text-slate-400">Abertura: </dt><dd className="inline">{det.perfil_rfb.data_inicio ? fmtDate(det.perfil_rfb.data_inicio) : "—"}</dd></div>
                    </dl>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {empresa.cnpj_basico
                        ? "Sem dados da RFB para este CNPJ neste município."
                        : "Empresa sem vínculo com a base CNPJ — vincule no formulário de edição."}
                    </p>
                  )}
                  <FatoresRfb relevancia={relevancia} />
                </div>
              </PlanGate>
            </div>
          )}

          {/* ── Aba Contatos & Visitas ── */}
          {aba === 1 && (
            <div className="space-y-4">
              {timeline == null ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhum contato ou visita registrado.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map(({ kind, item }) => (
                    <div key={`${kind}-${item.id}`} data-testid="timeline-item" className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${kind === "visita" ? "bg-blue-500" : "bg-violet-500"}`} />
                        <div className="w-px flex-1 bg-[var(--panel-2)] mt-1" />
                      </div>
                      <div className="flex-1 pb-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--text-dim)]">
                            <span className="font-semibold">{kind === "visita" ? "Visita" : TIPO_CONTATO[item.tipo] || "Contato"}</span>
                            {" · "}{fmtDate(kind === "visita" ? item.data_visita : item.data)}
                          </p>
                          {canEditar && (
                            <button type="button"
                              onClick={() => excluir(
                                kind === "visita"
                                  ? `/desenvolvimento-economico/retencao/visitas/${item.id}`
                                  : `/desenvolvimento-economico/retencao/contatos/${item.id}`,
                                kind === "visita" ? "Visita removida" : "Contato removido")}
                              className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                              aria-label={`Excluir ${kind === "visita" ? "visita" : "contato"} de ${fmtDate(kind === "visita" ? item.data_visita : item.data)}`}>
                              <TrashIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {item.responsavel && <p className="text-xs text-slate-400">{item.responsavel}</p>}
                        {item.observacoes && <p className="text-xs text-[var(--text-dim)]">{item.observacoes}</p>}
                        {item.foto_base64 && (
                          <img src={item.foto_base64} alt="Foto da visita" className="w-16 h-16 object-cover rounded mt-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canEditar && (
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Registrar contato</p>
                  <input aria-label="Data do contato" type="date" value={contatoForm.data}
                    onChange={(e) => setContatoForm((p) => ({ ...p, data: e.target.value }))} className={inputCls} />
                  <select aria-label="Tipo do contato" value={contatoForm.tipo}
                    onChange={(e) => setContatoForm((p) => ({ ...p, tipo: e.target.value }))} className={inputCls}>
                    {Object.entries(TIPO_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={contatoForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setContatoForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <textarea value={contatoForm.observacoes} placeholder="Observações" rows={2}
                    onChange={(e) => setContatoForm((p) => ({ ...p, observacoes: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <button type="button" onClick={addContato} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Registrar contato
                  </button>

                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider pt-2">Registrar visita</p>
                  <input aria-label="Data da visita" type="date" value={visitaForm.data_visita}
                    onChange={(e) => setVisitaForm((p) => ({ ...p, data_visita: e.target.value }))} className={inputCls} />
                  <input value={visitaForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setVisitaForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <textarea value={visitaForm.observacoes} placeholder="Observações" rows={2}
                    onChange={(e) => setVisitaForm((p) => ({ ...p, observacoes: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                    <CameraIcon className="w-4 h-4" />
                    {visitaForm.foto_base64 ? "Foto selecionada ✓" : "Adicionar foto"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                  </label>
                  <button type="button" onClick={addVisita} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    Registrar visita
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Aba Demandas ── */}
          {aba === 2 && (
            <div className="space-y-4">
              {det == null ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (det.demandas || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhuma demanda registrada.</p>
              ) : (
                <div className="space-y-3">
                  {det.demandas.map((d) => {
                    const st = STATUS_DEMANDA[d.status] || STATUS_DEMANDA.aberta;
                    return (
                      <div key={d.id} className="rounded-xl border border-[var(--border)] p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-[var(--text)] flex-1">{d.descricao}</p>
                          {canEditar && (
                            <div className="flex gap-1 shrink-0">
                              <button type="button"
                                onClick={() => {
                                  setEditingDemandaId(d.id);
                                  setDemandaForm({ descricao: d.descricao, data_registro: d.data_registro, responsavel: d.responsavel || "" });
                                }}
                                className="p-1 rounded text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
                                aria-label={`Editar demanda ${d.descricao}`}>
                                <PencilIcon className="w-3 h-3" />
                              </button>
                              <button type="button"
                                onClick={() => excluir(`/desenvolvimento-economico/retencao/demandas/${d.id}`, "Demanda removida")}
                                className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                aria-label={`Excluir demanda ${d.descricao}`}>
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {fmtDate(d.data_registro)}{d.responsavel && ` · ${d.responsavel}`}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {st.label} desde {fmtDate(statusDesde(d))}
                          {" · "}
                          <button
                            type="button"
                            aria-label={`ver histórico de ${d.descricao}`}
                            aria-expanded={Boolean(historicoAberto[d.id])}
                            onClick={() => setHistoricoAberto((p) => ({ ...p, [d.id]: !p[d.id] }))}
                            className="text-blue-600 hover:text-blue-700 cursor-pointer"
                          >
                            {historicoAberto[d.id] ? "ocultar histórico" : "ver histórico"}
                          </button>
                        </p>
                        {historicoAberto[d.id] && (
                          (d.historico || []).length === 0 ? (
                            <p className="text-[11px] text-slate-400">Sem histórico registrado (anterior a set/2026).</p>
                          ) : (
                            <ul className="text-[11px] text-[var(--text-dim)] space-y-0.5">
                              {d.historico.map((h, i) => (
                                <li key={i}>
                                  {fmtDateTime(h.alterado_em)} · {h.de ? `${rotuloStatus(h.de)} → ${rotuloStatus(h.para)}` : `criada como ${rotuloStatus(h.para)}`}{h.alterado_por_nome && ` · ${h.alterado_por_nome}`}
                                </li>
                              ))}
                            </ul>
                          )
                        )}
                        {canEditar ? (
                          <select aria-label={`Status da demanda ${d.descricao}`} value={d.status}
                            onChange={(e) => mudarStatusDemanda(d, e.target.value)} className={inputCls}>
                            {Object.entries(STATUS_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEditar && (
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                    {editingDemandaId ? "Editar demanda" : "Registrar demanda"}
                  </p>
                  <textarea aria-label="Descrição da demanda" value={demandaForm.descricao}
                    placeholder="Descrição *" rows={2}
                    onChange={(e) => setDemandaForm((p) => ({ ...p, descricao: e.target.value }))}
                    className={`${inputCls} resize-none`} />
                  <input aria-label="Data da demanda" type="date" value={demandaForm.data_registro}
                    onChange={(e) => setDemandaForm((p) => ({ ...p, data_registro: e.target.value }))} className={inputCls} />
                  <input value={demandaForm.responsavel} placeholder="Responsável"
                    onChange={(e) => setDemandaForm((p) => ({ ...p, responsavel: e.target.value }))} className={inputCls} />
                  <button type="button" onClick={addDemanda} disabled={salvando}
                    className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer">
                    {editingDemandaId ? "Salvar demanda" : "Registrar demanda"}
                  </button>
                  {editingDemandaId && (
                    <button type="button"
                      onClick={() => { setEditingDemandaId(null); setDemandaForm(defaultDemanda); }}
                      className="w-full py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-dim)] cursor-pointer">
                      Cancelar edição
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </NidDrawer>
  );
}
