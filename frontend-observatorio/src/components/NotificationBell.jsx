import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { BellAlertIcon } from "@heroicons/react/24/solid";

const TIPO_STYLES = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  alert: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const TIPO_LABELS = { info: "Info", warning: "Aviso", alert: "Alerta" };

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetchNotifs = async () => {
    try {
      const res = await api.get("/notificacoes");
      setNotifs(res.data || []);
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const unread = notifs.filter((n) => !n.lida).length;

  const markLida = async (id) => {
    try {
      await api.post(`/notificacoes/${id}/marcar_lida`);
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
    } catch {
      // silent fail
    }
  };

  const markAllLida = async () => {
    const unreadItems = notifs.filter((n) => !n.lida);
    await Promise.all(unreadItems.map((n) => api.post(`/notificacoes/${n.id}/marcar_lida`).catch(() => {})));
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        aria-label="Notificações"
      >
        {unread > 0 ? (
          <BellAlertIcon className="w-5 h-5 text-amber-500" />
        ) : (
          <BellIcon className="w-5 h-5" />
        )}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-sm text-slate-800 dark:text-white">
              Notificações
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllLida}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Marcar todas
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                <BellIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nenhuma notificação
              </div>
            ) : (
              notifs.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 ${
                    n.lida
                      ? "opacity-60"
                      : "bg-slate-50/60 dark:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            TIPO_STYLES[n.tipo] || TIPO_STYLES.info
                          }`}
                        >
                          {TIPO_LABELS[n.tipo] || n.tipo}
                        </span>
                        {!n.lida && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {n.titulo}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {n.mensagem}
                      </p>
                    </div>
                  </div>
                  {!n.lida && (
                    <button
                      onClick={() => markLida(n.id)}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
