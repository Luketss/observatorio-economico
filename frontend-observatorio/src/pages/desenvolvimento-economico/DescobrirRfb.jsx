import { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import NidSelect from "../../components/nid/NidSelect";

// Aba "Descobrir na base RFB": empresas do município ainda não acompanhadas,
// por score RFB decrescente (0–45: porte, tempo, capital, situação), com
// filtros no servidor e paginação por "Carregar mais".
const BASE = "/desenvolvimento-economico/retencao/descobrir";
const POR_PAGINA = 20;
const SITUACOES = [
  { value: "02", label: "Ativas" }, { value: "03", label: "Suspensas" }, { value: "04", label: "Inaptas" },
  { value: "08", label: "Baixadas" }, { value: "01", label: "Nulas" }, { value: "todas", label: "Todas" },
];
const PORTES = [
  { value: "", label: "Todos os portes" }, { value: "01", label: "Micro" }, { value: "03", label: "Pequena" },
  { value: "05", label: "Média" }, { value: "07", label: "Grande" }, { value: "00", label: "Não informado" },
];
const PORTE_RFB = { "00": "Não informado", "01": "Micro", "03": "Pequena", "05": "Média", "07": "Grande" };
const SITUACAO_RFB = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
const ERRO_CARGA = "Não foi possível carregar a base RFB.";

function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR");
function corSituacao(s) {
  if (s === "08" || s === "01") return "var(--accent-2)";
  if (s === "03" || s === "04") return "var(--accent-4)";
  return undefined;
}

export default function DescobrirRfb({ onAcompanhar, canCriar, refreshKey = 0 }) {
  const [situacao, setSituacao] = useState("02");
  const [porte, setPorte] = useState("");
  const [divisao, setDivisao] = useState("");
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");                 // busca com debounce; "" = sem filtro
  const [divisoes, setDivisoes] = useState([]);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(null);
  const [erroMais, setErroMais] = useState(null);
  // Versão da primeira página: um "Carregar mais" em voo não anexa em cima
  // de outro filtro.
  const versaoRef = useRef(0);

  // Divisões CNAE presentes no município (uma vez por montagem / recarga).
  useEffect(() => {
    let vivo = true;
    api.get(`${BASE}/divisoes`)
      .then((res) => { if (vivo) setDivisoes(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (vivo) setDivisoes([]); });
    return () => { vivo = false; };
  }, [refreshKey]);

  // Debounce da busca: só envia com 2+ caracteres.
  useEffect(() => {
    const t = setTimeout(() => {
      const termo = busca.trim();
      setQ(termo.length >= 2 ? termo : "");
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const params = (offset) => ({
    situacao,
    ...(porte ? { porte } : {}),
    ...(divisao ? { divisao } : {}),
    ...(q ? { q } : {}),
    limit: POR_PAGINA,
    offset,
  });

  // Primeira página a cada mudança de filtro ou refreshKey; resposta superada
  // (filtro mudou antes de ela chegar) é ignorada pelo cleanup.
  useEffect(() => {
    let vivo = true;
    versaoRef.current += 1;
    setCarregando(true);
    setErro(null);
    setErroMais(null);
    setItens([]);
    setTotal(0);
    api.get(BASE, { params: params(0) })
      .then((res) => {
        if (!vivo) return;
        setItens(res.data?.itens ?? []);
        setTotal(res.data?.total ?? 0);
      })
      .catch(() => { if (vivo) setErro(ERRO_CARGA); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao, porte, divisao, q, refreshKey]);

  async function carregarMais() {
    const versao = versaoRef.current;
    setCarregandoMais(true);
    setErroMais(null);
    try {
      const res = await api.get(BASE, { params: params(itens.length) });
      if (versao !== versaoRef.current) return;
      setItens((prev) => [...prev, ...(res.data?.itens ?? [])]);
      setTotal(res.data?.total ?? total);
    } catch {
      if (versao === versaoRef.current) setErroMais(ERRO_CARGA);
    } finally {
      setCarregandoMais(false);
    }
  }

  const semFiltro = situacao === "02" && !porte && !divisao && !q;
  const inputCls = "px-3 py-1.5 rounded-xl border border-[var(--border)] text-sm bg-[var(--panel)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] min-w-[220px]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NidSelect value={situacao} onChange={(e) => setSituacao(e.target.value)} ariaLabel="Situação cadastral">
          {SITUACOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </NidSelect>
        <NidSelect value={porte} onChange={(e) => setPorte(e.target.value)} ariaLabel="Porte">
          {PORTES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </NidSelect>
        <NidSelect value={divisao} onChange={(e) => setDivisao(e.target.value)} ariaLabel="Divisão CNAE">
          <option value="">Todas as divisões CNAE</option>
          {divisoes.map((d) => (
            <option key={d.divisao} value={d.divisao}>{d.descricao} · {fmtInt(d.total)}</option>
          ))}
        </NidSelect>
        <input
          aria-label="Buscar na base RFB"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CNPJ…"
          className={inputCls}
        />
      </div>

      <div>
        {!carregando && (
          <p className="text-sm text-[var(--text)]">
            {fmtInt(total)} {total === 1 ? "empresa" : "empresas"} na base RFB ainda não acompanhada{total === 1 ? "" : "s"}
          </p>
        )}
        <p className="text-xs text-slate-400">
          Score RFB de 0 a 45: porte, tempo de atividade, capital e situação — os pontos de empregos e potencial
          entram quando a empresa é acompanhada.
        </p>
      </div>

      {erro && <p role="alert" className="text-sm" style={{ color: "var(--accent-2)" }}>{erro}</p>}
      {carregando && !erro && <p role="status" className="text-sm text-slate-400">Carregando…</p>}

      {!carregando && !erro && itens.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          {semFiltro
            ? "Todas as empresas da base RFB deste município já estão acompanhadas — ou a base ainda não foi coletada."
            : "Nenhuma empresa da base RFB corresponde aos filtros."}
        </p>
      )}

      {!carregando && !erro && itens.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 uppercase tracking-wider">
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Divisão CNAE</th>
                <th className="px-3 py-2">Porte</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2">Capital</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2 text-right">Score</th>
                {canCriar && <th className="px-3 py-2" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {itens.map((e) => (
                <tr key={e.cnpj_basico} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--text)]">{e.razao_social}</span>
                    {e.nome_fantasia && <span className="text-slate-400"> · {e.nome_fantasia}</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{e.divisao_descricao || "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{PORTE_RFB[e.porte] || e.porte || "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{e.data_inicio ? e.data_inicio.slice(0, 4) : "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{fmtBRL(e.capital_social)}</td>
                  <td className="px-3 py-2" style={{ color: corSituacao(e.situacao) }}>{SITUACAO_RFB[e.situacao] || e.situacao || "—"}</td>
                  <td className="px-3 py-2 text-right font-bold text-[var(--text)] tabular-nums" title="porte + tempo + capital, ajustado pela situação">{e.score}</td>
                  {canCriar && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAcompanhar(e)}
                        aria-label={`Acompanhar ${e.razao_social}`}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                      >
                        Acompanhar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!carregando && !erro && itens.length < total && (
        <div className="flex flex-col items-center gap-2">
          {erroMais && <p role="alert" className="text-sm" style={{ color: "var(--accent-2)" }}>{erroMais}</p>}
          <button
            type="button"
            onClick={carregarMais}
            disabled={carregandoMais}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-50 cursor-pointer"
          >
            {carregandoMais ? "Carregando…" : `Carregar mais (${fmtInt(itens.length)} de ${fmtInt(total)})`}
          </button>
        </div>
      )}
    </div>
  );
}
