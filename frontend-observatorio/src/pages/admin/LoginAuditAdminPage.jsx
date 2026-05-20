import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../../services/api";

const PAGE_SIZE = 25;

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

const MOTIVO_LABELS = {
  ok: "Sucesso",
  invalid_credentials: "Credenciais inválidas",
  inactive: "Conta inativa",
};

const FILTERS = [
  { value: "all", label: "Todos", sucesso: undefined },
  { value: "fail", label: "Falhas", sucesso: false },
  { value: "ok", label: "Sucessos", sucesso: true },
];

export default function LoginAuditAdminPage() {
  const [summary, setSummary] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Summary loads once.
  useEffect(() => {
    api
      .get("/admin/login-audit/summary")
      .then((r) => setSummary(r.data?.data?.items || []))
      .catch(() => {});
  }, []);

  // Reset to first page when the filter changes.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // List reloads on page / filter change.
  useEffect(() => {
    const f = FILTERS.find((x) => x.value === filter);
    const params = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
    if (f?.sucesso !== undefined) params.sucesso = f.sucesso;

    setLoading(true);
    setError(false);
    api
      .get("/admin/login-audit", { params })
      .then((r) => {
        setRows(r.data?.items || []);
        setTotal(r.data?.total || 0);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, filter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Logins / Auditoria
          </h1>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Atividade de login das contas de administrador global — últimos acessos
            e tentativas de autenticação.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.map((s) => (
          <div
            key={s.usuario_id}
            className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="w-4 h-4 text-[var(--text-mute)]" />
              <span className="font-semibold text-[var(--text)] truncate">{s.nome}</span>
            </div>
            <p className="text-xs text-[var(--text-mute)] truncate mb-3">{s.email}</p>
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="text-[var(--text-mute)] block">Último login</span>
                <span className="text-[var(--text-dim)]">{fmtDateTime(s.last_login)}</span>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  s.failed_24h > 0
                    ? "bg-[var(--panel-2)] text-red-400"
                    : "bg-[var(--panel-2)] text-[var(--text-mute)]"
                }`}
                title="Tentativas falhas nas últimas 24h"
              >
                {s.failed_24h} falha{s.failed_24h !== 1 ? "s" : ""} (24h)
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.value
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">
            Carregando...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">
            Não foi possível carregar a auditoria de login.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm">
            Nenhum registro de login encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Data / Hora
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    E-mail
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Resultado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    IP
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Navegador
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--panel-2)]/40 transition-colors">
                    <td className="px-6 py-3 text-[var(--text-dim)] text-xs whitespace-nowrap">
                      {fmtDateTime(r.criado_em)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {r.email_tentado}
                    </td>
                    <td className="px-4 py-3">
                      {r.sucesso ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--panel-2)] text-emerald-400">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--panel-2)] text-red-400">
                          <XCircleIcon className="w-3.5 h-3.5" />
                          {MOTIVO_LABELS[r.motivo] || "Falha"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-dim)] text-xs font-mono">
                      {r.ip || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-mute)] text-xs max-w-xs">
                      <div className="truncate" title={r.user_agent || ""}>
                        {r.user_agent || "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
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
              <span>
                {page + 1} / {totalPages}
              </span>
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
    </motion.div>
  );
}
