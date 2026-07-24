import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";
import BarraExecucao from "../../components/nid/BarraExecucao";

const tipoCurto = (t) => (t || "").split(" - ")[0];

export default function EmendasPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [radar, setRadar] = useState(null);
  const [ano, setAno] = useState("");           // "" = todos os anos
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    setLoading(true);
    api.get("/emendas/radar", { params: ano ? { ano } : {} })
      .then((r) => setRadar(r.data))
      .catch((err) => console.error("Erro ao carregar radar de emendas:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio, ano]);

  const maxFuncao = useMemo(
    () => Math.max(1, ...(radar?.por_funcao || []).map((f) => f.empenhado)),
    [radar]
  );

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Radar de Emendas" sub="Emendas parlamentares destinadas ao município" />
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">Use <b>"Ver como"</b> na administração de Municípios.</p>
        </div>
      </motion.div>
    );
  }

  if (loading && !radar) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const k = radar?.kpis;
  const indisponivel = !radar?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <NidPageHeader title="Radar de Emendas" sub="Quem envia recurso, quanto e o que já foi executado" />
        <InfoTooltip dataset="emendas" />
        {(radar?.anos || []).length > 0 && (
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="ml-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-sm px-3 py-1.5"
            aria-label="Filtrar por ano"
          >
            <option value="">Todos os anos</option>
            {radar.anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Sem emendas carregadas</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            Execute a fonte automática "Emendas Parlamentares (Portal da Transparência)" em Administração → Fontes de Dados.
            Emendas com localidade "Nacional" ou estadual não são municipalizáveis — o total aqui é um piso.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Total destinado (empenhado)" value={fmtMoneyShort(k.total_empenhado)} sub={`${k.num_emendas} emenda(s)`} dataset="emendas" indicadorKey="total_empenhado" />
            <KpiCard label="Executado (pago)" value={fmtMoneyShort(k.pago_total)} sub={k.pct_pago != null ? `${Number(k.pct_pago).toLocaleString("pt-BR")}% do empenhado` : "—"} dataset="emendas" indicadorKey="pago_total" />
            <KpiCard label="Parlamentares" value={String(k.num_parlamentares)} sub="autores com emendas destinadas" dataset="emendas" indicadorKey="num_parlamentares" />
            <KpiCard label="Maior padrinho" value={k.top_autor || "—"} sub={k.top_autor_valor != null ? fmtMoneyShort(k.top_autor_valor) : ""} dataset="emendas" indicadorKey="top_autor" />
          </div>

          <NidPanel title="Ranking por parlamentar" sub="Total destinado e execução — quem manda (e quem não manda) recurso">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">#</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Parlamentar</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Emendas</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Destinado (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Pago (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {radar.por_autor.map((a, i) => (
                    <tr key={a.autor} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-dim)]">{i + 1}º</td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{a.autor}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{a.num_emendas}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(a.empenhado)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(a.pago_total)}</td>
                      <td className="px-3 py-2"><BarraExecucao pct={a.pct_pago} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NidPanel>

          <NidPanel title="Destino por área" sub="Total empenhado por função orçamentária">
            <div className="space-y-2">
              {radar.por_funcao.map((f) => (
                <div key={f.funcao} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text)] w-40 truncate" title={f.funcao}>{f.funcao}</span>
                  <div className="flex-1 h-3 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(f.empenhado / maxFuncao) * 100}%`, background: "var(--accent-3)" }} />
                  </div>
                  <span className="text-xs text-[var(--text-dim)] w-24 text-right">{fmtMoneyShort(f.empenhado)}</span>
                </div>
              ))}
              {radar.por_funcao.length === 0 && (
                <p className="text-sm text-[var(--text-dim)] text-center py-4">Sem detalhamento por função.</p>
              )}
            </div>
          </NidPanel>

          <NidPanel title="Emendas destinadas ao município" sub="Funil de execução: empenhado → liquidado → pago (inclui restos a pagar pagos)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Ano</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Autor</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Tipo</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Área</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Empenhado (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Pago (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Execução</th>
                    <th className="px-3 py-2" aria-label="Ações"></th>
                  </tr>
                </thead>
                <tbody>
                  {radar.emendas.map((e) => (
                    <tr key={`${e.codigo}-${e.ano}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text)]">{e.ano}</td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{e.autor}</td>
                      <td className="px-3 py-2 text-[var(--text-dim)]" title={e.tipo}>{tipoCurto(e.tipo)}</td>
                      <td className="px-3 py-2 text-[var(--text-dim)]">{e.funcao || "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(e.empenhado)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(e.pago_total)}</td>
                      <td className="px-3 py-2"><BarraExecucao pct={e.pct_pago} /></td>
                      <td className="px-3 py-2 text-right">
                        <CriarOportunidadeCaptacao
                          compact
                          label="Criar oportunidade no funil a partir desta emenda"
                          payload={{
                            tipo: "emenda",
                            titulo: `Emenda ${e.numero || e.codigo} — ${e.autor} (${e.ano})`,
                            entidade_origem: e.autor,
                            valor_estimado: e.empenhado || null,
                            descricao: `Emenda ${tipoCurto(e.tipo)} · área ${e.funcao || "n/d"} · pago ${fmtMoneyFull(e.pago_total)} de ${fmtMoneyFull(e.empenhado)}.`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
