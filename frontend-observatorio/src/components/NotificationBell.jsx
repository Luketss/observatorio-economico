import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchNotificacoes, marcarLida, marcarTodasLidas } from "../services/notificacoesApi";

const KIND_CLASS = {
  info: "info",
  warning: "down",
  alert: "down",
  up: "up",
  down: "down",
};

const KIND_GLYPH = {
  up: "↗",
  down: "↘",
  info: "i",
  warning: "!",
  alert: "!",
};

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  const updatePanelPos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 10,
      right: window.innerWidth - rect.right,
    });
  };

  const fetchNotifs = async () => {
    try {
      setNotifs(await fetchNotificacoes());
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest("[data-bell-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [open]);

  const unread = notifs.filter((n) => !n.lida).length;

  const markLida = async (id) => {
    try {
      await marcarLida(id);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    } catch {
      // silent fail
    }
  };

  const markAllLida = async () => {
    await marcarTodasLidas(notifs);
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nid-bell"
        aria-label="Notificações"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="nid-bell-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && createPortal(
        <div
          className="nid-bell-panel"
          data-bell-panel=""
          style={{ top: panelPos.top, right: panelPos.right }}
        >
          <div className="nid-bell-head">
            <div>
              <div className="nid-bell-title">Notificações</div>
              <div className="nid-bell-sub">
                {unread > 0 ? `${unread} não lidas` : "Tudo em dia"}
              </div>
            </div>
            {unread > 0 && (
              <button onClick={markAllLida} className="nid-bell-mark">
                Marcar tudo como lido
              </button>
            )}
          </div>

          <div className="nid-bell-list">
            {notifs.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-mute)",
                  fontSize: 13,
                }}
              >
                Nenhuma notificação
              </div>
            ) : (
              notifs.map((n) => {
                const kindClass = KIND_CLASS[n.tipo] || "info";
                const glyph = KIND_GLYPH[n.tipo] || "i";
                return (
                  <div
                    key={n.id}
                    className={`nid-bell-item ${!n.lida ? "unread" : ""}`}
                    onClick={() => !n.lida && markLida(n.id)}
                  >
                    <div className={`nid-bell-mk ${kindClass}`}>{glyph}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nid-bell-row">
                        <div className="nid-bell-item-title">{n.titulo}</div>
                        <div className="nid-bell-time">{timeAgo(n.criado_em)}</div>
                      </div>
                      <div className="nid-bell-text">{n.mensagem}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="nid-bell-foot">
            <button
              className="nid-bell-link"
              onClick={() => { setOpen(false); navigate("/app/notificacoes"); }}
            >
              Ver todas as notificações →
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
