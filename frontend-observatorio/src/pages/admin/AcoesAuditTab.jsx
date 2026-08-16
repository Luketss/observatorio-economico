import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";

const PAGE_SIZE = 25;

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

const ACAO_LABELS = {
  usuario_criado: "Usuário criado",
  usuario_atualizado: "Usuário atualizado",
  usuario_excluido: "Usuário excluído",
  usuarios_listados: "Usuários listados",
  auditoria_consultada: "Auditoria consultada",
};

const CATEGORIA_OPTIONS = [
  { value: "", label: "Todas as categorias" },
  { value: "acao", label: "Ações" },
  { value: "leitura", label: "Leituras" },
];

const ACAO_OPTIONS = [
  { value: "", label: "Todos os eventos" },
  ...Object.entries(ACAO_LABELS).map(([value, label]) => ({ value, label })),
];

export default function AcoesAuditTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [acao, setAcao] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEmailQuery(emailInput.trim()), 350);
    return () => clearTimeout(t);
  }, [emailInput]);

  useEffect(() => {
    setPage(0);
  }, [categoria, acao, emailQuery]);

  useEffect(() => {
    const params = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
    if (categoria) params.categoria = categoria;
    if (acao) params.acao = acao;
    if (emailQuery) params.email = emailQuery;

    setLoading(true);
    setError(false);
    api
      .get("/admin/auditoria/acoes", { params })
      .then((r) => {
        setRows(r.data?.items || []);
        setTotal(r.data?.total || 0);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, categoria, acao, emailQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          aria-label="Filtrar por evento"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ACAO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="search"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="Buscar por e-mail (ator ou alvo)..."
          aria-label="Buscar por e-mail"
          className="text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        />
      </div>

      {/* Tabela */}
      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">
            Carregando...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">
            Não foi possível carregar a trilha de ações.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm">
            Nenhum registro de ação encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Data / Hora", "Ator", "Evento", "Alvo", "Detalhe", "IP"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider first:px-6"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--panel-2)]/40 transition-colors">
                    <td className="px-6 py-3 text-[var(--text-dim)] text-xs whitespace-nowrap">
                      {fmtDateTime(r.criado_em)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--text)]">{r.ator_email}</span>
                      {r.ator_nome && (
                        <span className="block text-xs text-[var(--text-mute)]">{r.ator_nome}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--panel-2)] ${
                          r.categoria === "acao" ? "text-amber-400" : "text-sky-400"
                        }`}
                      >
                        {ACAO_LABELS[r.acao] || r.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)]">
                      {r.alvo_email || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-mute)] text-xs max-w-md">
                      <div className="truncate" title={r.detalhe || ""}>
                        {r.detalhe || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)] text-xs font-mono">
                      {r.ip || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--text-mute)]">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Próxima página"
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
