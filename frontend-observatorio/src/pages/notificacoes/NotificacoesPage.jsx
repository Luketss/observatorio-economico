import { useEffect, useMemo, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { fetchNotificacoes, marcarLida, marcarTodasLidas } from "../../services/notificacoesApi";
import { useToast } from "../../context/ToastContext";
import NidTabBar from "../../components/nid/NidTabBar";

// Mesmo mapeamento visual do sino (NotificationBell.jsx)
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

function fmtDataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificacoesPage() {
  const { addToast } = useToast();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => {
    fetchNotificacoes()
      .then(setNotifs)
      .catch(() => addToast("Erro ao carregar notificações", "error"))
      .finally(() => setLoading(false));
  }, []);

  const naoLidas = useMemo(() => notifs.filter((n) => !n.lida), [notifs]);
  const visiveis = filtro === "nao_lidas" ? naoLidas : notifs;

  async function handleMarcarLida(n) {
    if (n.lida) return;
    try {
      await marcarLida(n.id);
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
    } catch {
      addToast("Erro ao marcar como lida", "error");
    }
  }

  async function handleMarcarTodas() {
    try {
      await marcarTodasLidas(notifs);
      setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
      addToast("Todas marcadas como lidas", "success");
    } catch {
      addToast("Erro ao marcar notificações", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Todas as notificações
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0" }}>
            {naoLidas.length > 0 ? `${naoLidas.length} não lida(s)` : "Tudo em dia"}
          </p>
        </div>
        {naoLidas.length > 0 && (
          <button onClick={handleMarcarTodas} className="nid-bell-mark">
            Marcar tudo como lido
          </button>
        )}
      </div>

      <NidTabBar
        tabs={[
          { key: "todas", label: "Todas", count: notifs.length },
          { key: "nao_lidas", label: "Não lidas", count: naoLidas.length },
        ]}
        value={filtro}
        onChange={setFiltro}
        ariaLabel="Filtrar notificações"
      />

      {visiveis.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-dim)" }}>
          <BellIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, margin: 0 }}>
            {filtro === "nao_lidas" ? "Nenhuma notificação não lida." : "Nenhuma notificação."}
          </p>
        </div>
      ) : (
        <div className="nid-panel" style={{ padding: 0, overflow: "hidden" }}>
          {visiveis.map((n, i) => {
            const kindClass = KIND_CLASS[n.tipo] || "info";
            const glyph = KIND_GLYPH[n.tipo] || "i";
            return (
              <div
                key={n.id}
                className={`nid-bell-item ${!n.lida ? "unread" : ""}`}
                onClick={() => handleMarcarLida(n)}
                style={{
                  cursor: n.lida ? "default" : "pointer",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div className={`nid-bell-mk ${kindClass}`}>{glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nid-bell-row">
                    <div className="nid-bell-item-title">{n.titulo}</div>
                    <div className="nid-bell-time">{fmtDataHora(n.criado_em)}</div>
                  </div>
                  <div className="nid-bell-text" style={{ whiteSpace: "pre-line" }}>
                    {n.mensagem}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
