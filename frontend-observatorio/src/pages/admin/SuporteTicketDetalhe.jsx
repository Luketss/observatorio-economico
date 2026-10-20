// Painel lateral de detalhe de uma solicitação de suporte: contatos, status, anotações e histórico.
import { useCallback, useEffect, useState } from "react";
import { XMarkIcon, EnvelopeIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { linkWhatsAppPara } from "../../config/contato";
import StatusChip from "../../components/suporte/StatusChip";
import { STATUS_ORDEM, labelStatus } from "../../components/suporte/statusTicket";
import { mensagemErroApi } from "../../components/suporte/erroApi";

const CANAL_LABELS = { email: "E-mail", whatsapp: "WhatsApp" };

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

function formatarWhatsapp(numero) {
  const d = String(numero || "");
  const m11 = d.match(/^55(\d{2})(9\d{4})(\d{4})$/);
  if (m11) return `(${m11[1]}) ${m11[2]}-${m11[3]}`;
  const m10 = d.match(/^55(\d{2})(\d{4})(\d{4})$/);
  if (m10) return `(${m10[1]}) ${m10[2]}-${m10[3]}`;
  return d;
}

function rotuloEvento(ev) {
  if (ev.tipo === "abertura") return "Solicitação aberta";
  if (ev.tipo === "status") return `${labelStatus(ev.status_de)} → ${labelStatus(ev.status_para)}`;
  return "Anotação";
}

const INPUT_CLS =
  "w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const BTN_CLS =
  "text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed";
const ACAO_CLS =
  "inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text)]";

function Secao({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-mute)]">{titulo}</h3>
      {children}
    </section>
  );
}

export default function SuporteTicketDetalhe({ ticketId, onClose, onAtualizado }) {
  const { addToast } = useToast();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [novoStatus, setNovoStatus] = useState("");
  const [motivo, setMotivo] = useState("");
  const [anotacao, setAnotacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fechar = useCallback(() => onClose(), [onClose]);
  useEscapeKey(fechar, true);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setError(false);
    api
      .get(`/suporte/admin/tickets/${ticketId}`)
      .then((r) => {
        if (!ativo) return;
        setTicket(r.data);
        setNovoStatus(r.data.status);
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
  }, [ticketId]);

  const aplicar = (data, mensagem) => {
    setTicket(data);
    setNovoStatus(data.status);
    addToast(mensagem, "success");
    onAtualizado();
  };

  const alterarStatus = async () => {
    setSalvando(true);
    try {
      const r = await api.patch(`/suporte/admin/tickets/${ticket.id}/status`, {
        status: novoStatus,
        texto: motivo.trim() || null,
      });
      setMotivo("");
      aplicar(r.data, "Status atualizado.");
    } catch (err) {
      addToast(mensagemErroApi(err), "error");
    } finally {
      setSalvando(false);
    }
  };

  const registrarAnotacao = async () => {
    const texto = anotacao.trim();
    if (!texto) return;
    setSalvando(true);
    try {
      const r = await api.post(`/suporte/admin/tickets/${ticket.id}/anotacoes`, { texto });
      setAnotacao("");
      aplicar(r.data, "Anotação registrada.");
    } catch (err) {
      addToast(mensagemErroApi(err), "error");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={fechar} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Detalhe da solicitação"
        className="fixed inset-y-0 right-0 z-50 w-full md:w-[520px] overflow-y-auto bg-[var(--panel)] border-l border-[var(--border)] shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[var(--text)]">Solicitação #{ticketId}</h2>
            {ticket && <StatusChip status={ticket.status} />}
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-[var(--text-dim)] hover:bg-[var(--panel-2)]"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">Carregando…</div>
        ) : error || !ticket ? (
          <div className="p-8 text-center text-red-400 text-sm">Não foi possível carregar a solicitação.</div>
        ) : (
          <div className="p-6 space-y-6">
            <Secao titulo="Mensagem">
              <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{ticket.mensagem}</p>
            </Secao>

            <Secao titulo="Contato">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-[var(--text-mute)]">Nome</dt>
                <dd className="text-[var(--text)]">{ticket.usuario_nome}</dd>
                <dt className="text-[var(--text-mute)]">E-mail</dt>
                <dd className="text-[var(--text)] break-all">{ticket.usuario_email}</dd>
                <dt className="text-[var(--text-mute)]">Município</dt>
                <dd className="text-[var(--text)]">{ticket.municipio_nome || "—"}</dd>
                <dt className="text-[var(--text-mute)]">Papel</dt>
                <dd className="text-[var(--text)]">{ticket.usuario_role}</dd>
                <dt className="text-[var(--text-mute)]">WhatsApp</dt>
                <dd className="text-[var(--text)]">
                  {ticket.whatsapp ? formatarWhatsapp(ticket.whatsapp) : "não informado"}
                </dd>
                <dt className="text-[var(--text-mute)]">Canal preferido</dt>
                <dd className="text-[var(--text)]">
                  {CANAL_LABELS[ticket.canal_preferido] || ticket.canal_preferido}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`mailto:${ticket.usuario_email}?subject=${encodeURIComponent(`Suporte NID – solicitação #${ticket.id}`)}`}
                  className={`${ACAO_CLS} hover:bg-[var(--panel-2)]`}
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  Responder por e-mail
                </a>
                {ticket.whatsapp ? (
                  <a
                    href={linkWhatsAppPara(
                      ticket.whatsapp,
                      `Olá ${ticket.usuario_nome}, aqui é o suporte do NID sobre a sua solicitação #${ticket.id}.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${ACAO_CLS} hover:bg-[var(--panel-2)]`}
                  >
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    Chamar no WhatsApp
                  </a>
                ) : (
                  <span aria-disabled="true" className={`${ACAO_CLS} opacity-40 cursor-not-allowed`}>
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    Chamar no WhatsApp
                  </span>
                )}
              </div>
            </Secao>

            <Secao titulo="Status">
              <div className="space-y-2">
                <select
                  aria-label="Novo status"
                  value={novoStatus}
                  onChange={(e) => setNovoStatus(e.target.value)}
                  className={INPUT_CLS}
                >
                  {STATUS_ORDEM.map((s) => (
                    <option key={s} value={s}>
                      {labelStatus(s)}
                    </option>
                  ))}
                </select>
                <div>
                  <label htmlFor="suporte-motivo" className="block text-xs font-semibold text-[var(--text-dim)] mb-1">
                    Motivo/observação (opcional)
                  </label>
                  <input
                    id="suporte-motivo"
                    type="text"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <button
                  type="button"
                  onClick={alterarStatus}
                  disabled={novoStatus === ticket.status || salvando}
                  className={BTN_CLS}
                >
                  Alterar status
                </button>
              </div>
            </Secao>

            <section className="space-y-2">
              <label
                htmlFor="suporte-anotacao"
                className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-mute)]"
              >
                Anotação interna
              </label>
              <textarea
                id="suporte-anotacao"
                rows={3}
                value={anotacao}
                onChange={(e) => setAnotacao(e.target.value)}
                className={INPUT_CLS}
              />
              <button
                type="button"
                onClick={registrarAnotacao}
                disabled={!anotacao.trim() || salvando}
                className={BTN_CLS}
              >
                Registrar
              </button>
            </section>

            <Secao titulo="Histórico">
              <ol className="space-y-3">
                {ticket.eventos.map((ev) => (
                  <li key={ev.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-mute)]">
                      <span>{fmtDateTime(ev.criado_em)}</span>
                      <span className="truncate">{ev.autor_email}</span>
                    </div>
                    <div className="font-semibold text-[var(--text)] mt-1">{rotuloEvento(ev)}</div>
                    {ev.texto && <p className="whitespace-pre-wrap text-[var(--text-dim)] mt-1">{ev.texto}</p>}
                  </li>
                ))}
              </ol>
            </Secao>
          </div>
        )}
      </aside>
    </>
  );
}
