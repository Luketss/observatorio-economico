import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { FlagIcon, PlusIcon } from "@heroicons/react/24/outline";
import NidTabBar from "./nid/NidTabBar";

// ── Kind config ──────────────────────────────────────────────────────────────
const KIND_CONFIG = {
  inicio_mandato: { eyebrow: "Início de Mandato", railClass: "start" },
  obras:          { eyebrow: "Obra",               railClass: "obras" },
  politica:       { eyebrow: "Política Pública",   railClass: "politica" },
  evento:         { eyebrow: "Evento",             railClass: "evento" },
};
const FALLBACK_KIND = { eyebrow: "Evento", railClass: "evento" };

// Filter tabs — key "all" means no filter
const FILTER_TABS = [
  { key: "all",           label: "Todos"    },
  { key: "inicio_mandato",label: "Início"   },
  { key: "obras",         label: "Obras"    },
  { key: "politica",      label: "Política" },
  { key: "evento",        label: "Eventos"  },
];

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── MandatoTimeline ──────────────────────────────────────────────────────────
export default function MandatoTimeline({ municipioId }) {
  const { user } = useAuth();
  const [marcos,    setMarcos]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeKind,setActiveKind] = useState("all");

  const canManage =
    user?.role === "ADMIN_GLOBAL" || user?.role === "ADMIN_MUNICIPIO";

  useEffect(() => {
    const params = municipioId ? { municipio_id: municipioId } : {};
    api
      .get("/marcos", { params })
      .then((r) => setMarcos(r.data || []))
      .catch(() => setMarcos([]))
      .finally(() => setLoading(false));
  }, [municipioId]);

  // ── Tabs with counts ────────────────────────────────────────────────────────
  const tabs = FILTER_TABS.map((t) => ({
    ...t,
    count:
      t.key === "all"
        ? marcos.length
        : marcos.filter((m) => m.tipo === t.key).length,
  }));

  const visible =
    activeKind === "all"
      ? marcos
      : marcos.filter((m) => m.tipo === activeKind);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="nid-panel">
        <div className="tl-skeleton-head" />
        <div style={{ display: "flex", gap: "18px", overflow: "hidden", marginTop: "16px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="tl-skeleton-card" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="nid-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className="nid-panel-head">
        <div>
          <p className="nid-panel-title">Memória Institucional</p>
          <p className="nid-panel-sub">Marcos e eventos do município</p>
        </div>
        {canManage && (
          <Link to="/admin/mandato" className="tl-manage-link">
            <PlusIcon style={{ width: "14px", height: "14px" }} />
            Gerenciar
          </Link>
        )}
      </div>

      {/* ── NidTabBar kind filter ──────────────────────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <NidTabBar
          tabs={tabs}
          value={activeKind}
          onChange={setActiveKind}
          ariaLabel="Filtrar por tipo de evento"
        />
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {visible.length === 0 && (
        <div className="tl-empty">
          <FlagIcon className="tl-empty__icon" />
          <p className="tl-empty__text">
            {activeKind === "all"
              ? "Nenhum marco registrado ainda."
              : "Nenhum evento deste tipo registrado."}
          </p>
          {canManage && activeKind === "all" && (
            <Link to="/admin/mandato" className="tl-empty__link">
              <PlusIcon style={{ width: "14px", height: "14px" }} />
              Adicionar primeiro marco
            </Link>
          )}
        </div>
      )}

      {/* ── Rail timeline ─────────────────────────────────────────────────── */}
      {visible.length > 0 && (
        <div className="tl-wrap">
          {/* Horizontal rail line */}
          <div className="tl-rail" />

          <div className="tl-row">
            {visible.map((marco, i) => {
              const cfg    = KIND_CONFIG[marco.tipo] || FALLBACK_KIND;
              const isBelow = i % 2 !== 0; // odd → card below rail

              return (
                <motion.div
                  key={marco.id}
                  className="tl-item"
                  initial={{ opacity: 0, y: isBelow ? 8 : -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                >
                  {/* Card ABOVE rail for even-indexed items */}
                  {!isBelow && (
                    <div className="tl-card tl-card--above">
                      <div className={`kind ${cfg.railClass}`}>
                        ●&nbsp;&nbsp;{cfg.eyebrow}
                      </div>
                      <h5>{marco.titulo}</h5>
                      <p className="meta">{fmtDate(marco.data)}</p>
                      {marco.descricao && (
                        <p className="tl-card__desc">{marco.descricao}</p>
                      )}
                      {marco.link && (
                        <a
                          href={marco.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tl-card__link"
                        >
                          Ver mais →
                        </a>
                      )}
                    </div>
                  )}

                  {/* Dot on the rail */}
                  <div className={`tl-dot ${cfg.railClass}`} />

                  {/* Card BELOW rail for odd-indexed items */}
                  {isBelow && (
                    <div className="tl-card tl-card--below">
                      <div className={`kind ${cfg.railClass}`}>
                        ●&nbsp;&nbsp;{cfg.eyebrow}
                      </div>
                      <h5>{marco.titulo}</h5>
                      <p className="meta">{fmtDate(marco.data)}</p>
                      {marco.descricao && (
                        <p className="tl-card__desc">{marco.descricao}</p>
                      )}
                      {marco.link && (
                        <a
                          href={marco.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tl-card__link"
                        >
                          Ver mais →
                        </a>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
