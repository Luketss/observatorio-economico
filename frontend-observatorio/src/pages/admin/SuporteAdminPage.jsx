// Página admin /admin/suporte: KPIs, filtros e lista paginada de solicitações de atendimento.
import { useCallback, useEffect, useState } from "react";
// eslint-disable-next-line no-unused-vars -- falso positivo: motion.* usado em JSX (mesmo caso do SuporteTicketModal)
import { motion } from "framer-motion";
import {
  LifebuoyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  ClockIcon,
  CheckCircleIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";
import KpiCard from "../../components/KpiCard";
import StatusChip from "../../components/suporte/StatusChip";
import { STATUS_ORDEM, labelStatus } from "../../components/suporte/statusTicket";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";

const PAGE_SIZE = 25;
const GRID_COLS = "grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto_2fr_auto] gap-x-4 gap-y-1";

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// eslint-disable-next-line react-refresh/only-export-components -- helper puro exportado para testes
export function formatarHoras(h) {
  if (h === null || h === undefined) return "—";
  return `${h.toFixed(1)} h`;
}

function resumirMensagem(msg) {
  const texto = msg || "";
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
}

const CANAL_LABELS = { email: "E-mail", whatsapp: "WhatsApp" };

export default function SuporteAdminPage() {
  const [kpis, setKpis] = useState(null);
  const [municipios, setMunicipios] = useState([]);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [status, setStatus] = useState("");
  const [municipioId, setMunicipioId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [versao, setVersao] = useState(0);
  // eslint-disable-next-line no-unused-vars -- lido pelo painel de detalhe (Task 12)
  const [selecionadoId, setSelecionadoId] = useState(null);

  // eslint-disable-next-line no-unused-vars -- passada como onAtualizado ao detalhe (Task 12)
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    api
      .get("/municipios")
      .then((r) => {
        if (ativo) setMunicipios(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    api
      .get("/suporte/admin/kpis")
      .then((r) => {
        if (ativo) setKpis(r.data);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [versao]);

  useEffect(() => {
    let ativo = true;
    const params = { skip, limit: PAGE_SIZE };
    if (status) params.status = status;
    if (municipioId) params.municipio_filtro = Number(municipioId);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mesmo padrao do LoginAuditAdminPage: indicador de carregamento da busca
    setLoading(true);
    setError(false);
    api
      .get("/suporte/admin/tickets", { params })
      .then((r) => {
        if (!ativo) return;
        setItens(r.data?.items || []);
        setTotal(r.data?.total || 0);
      })
      .catch(() => {
        if (ativo) setError(true);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [skip, status, municipioId, versao]);

  const trocarStatus = (valor) => {
    setStatus(valor);
    setSkip(0);
  };
  const trocarMunicipio = (valor) => {
    setMunicipioId(valor);
    setSkip(0);
  };

  const abertos = kpis?.abertos ?? 0;
  const emAtendimento = kpis?.em_atendimento ?? 0;
  const chips = [{ value: "", label: "Todos" }, ...STATUS_ORDEM.map((s) => ({ value: s, label: labelStatus(s) }))];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagina = Math.floor(skip / PAGE_SIZE);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[var(--text)]">
            <LifebuoyIcon className="w-6 h-6 text-[var(--text-mute)]" />
            Atendimento
          </h1>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Solicitações de suporte enviadas pelos usuários da plataforma.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Em aberto"
          value={kpis ? abertos + emAtendimento : "—"}
          sub={`${abertos} aguardando primeiro contato`}
          icon={InboxIcon}
          delay={0}
        />
        <KpiCard label="Abertos (30 dias)" value={kpis ? kpis.abertos_30d : "—"} icon={BoltIcon} delay={0.05} />
        <KpiCard
          label="Resolvidos (30 dias)"
          value={kpis ? kpis.resolvidos_30d : "—"}
          icon={CheckCircleIcon}
          delay={0.1}
        />
        <KpiCard
          label="Tempo até 1º contato"
          value={formatarHoras(kpis?.tempo_medio_primeiro_contato_horas)}
          icon={ClockIcon}
          delay={0.15}
        />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {chips.map((c) => (
            <button
              key={c.value || "todos"}
              type="button"
              aria-pressed={status === c.value}
              onClick={() => trocarStatus(c.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                status === c.value
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-municipio" className="text-xs font-semibold text-[var(--text-dim)]">
            Município
          </label>
          <select
            id="filtro-municipio"
            value={municipioId}
            onChange={(e) => trocarMunicipio(e.target.value)}
            className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.nome} – ${m.estado}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">Carregando…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">Não foi possível carregar as solicitações.</div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm">Nenhuma solicitação encontrada.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            <div
              className={`hidden md:grid ${GRID_COLS} px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}
            >
              <span>Data</span>
              <span>Usuário</span>
              <span>Município</span>
              <span>Canal</span>
              <span>Mensagem</span>
              <span>Status</span>
            </div>
            {itens.map((t) => (
              <div
                key={t.id}
                {...propsTituloClicavel(() => setSelecionadoId(t.id))}
                className={`${GRID_COLS} px-6 py-3 items-center text-sm cursor-pointer hover:bg-[var(--panel-2)]/40 transition-colors`}
              >
                <span className="text-[var(--text-dim)] text-xs whitespace-nowrap">{fmtDateTime(t.criado_em)}</span>
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text)] truncate">{t.usuario_nome}</div>
                  <div className="text-xs text-[var(--text-mute)] truncate">{t.usuario_email}</div>
                </div>
                <span className="text-[var(--text-dim)] truncate">{t.municipio_nome || "—"}</span>
                <span className="text-[var(--text-dim)] text-xs">
                  {CANAL_LABELS[t.canal_preferido] || t.canal_preferido}
                </span>
                <span className="text-[var(--text-dim)] truncate">{resumirMensagem(t.mensagem)}</span>
                <span>
                  <StatusChip status={t.status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--text-mute)]">
          <span>
            {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
              disabled={skip === 0}
              aria-label="Página anterior"
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <span>
              {pagina + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setSkip((s) => s + PAGE_SIZE)}
              disabled={skip + PAGE_SIZE >= total}
              aria-label="Próxima página"
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* detalhe: Task 12 */}
      {null}
    </motion.div>
  );
}
