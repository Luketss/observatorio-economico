import { useEffect, useState } from "react";
import api from "../services/api";

const DATASET_LABELS = {
  geral: "Visão Geral",
  arrecadacao: "Arrecadação",
  pib: "PIB",
  caged: "CAGED",
  rais: "RAIS",
  bolsa_familia: "Bolsa Família",
  pe_de_meia: "Pé-de-Meia",
  inss: "INSS",
  estban: "Bancos (Estban)",
  comex: "Comércio Exterior",
  empresas: "Empresas",
  pix: "PIX",
};

function datasetLabel(dataset) {
  const key = dataset.replace(/^release_/, "");
  return DATASET_LABELS[key] || key;
}

/**
 * Aggregates events from 3 backends into a unified event list.
 * Each event: { id, date, kind, title, source, link? }
 *
 * kind values:
 *   dados source   → uses the original tipo from EventoMunicipio
 *                    (cultural | administrativo | politico | saude | educacao | outro)
 *   mandato source → inicio_mandato | obras | politica | evento
 *   release source → "release"
 *
 * source values: dados-internos | mandato | releases
 */
export function useCalendarEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.allSettled([
      api.get("/dados_internos/eventos"),    // all events for this municipio
      api.get("/marcos"),                     // mandate timeline marcos
      api.get("/insights/releases"),          // editorial releases
    ])
      .then((results) => {
        if (!alive) return;
        const out = [];

        // — dados-internos eventos —
        if (results[0].status === "fulfilled") {
          for (const e of results[0].value.data || []) {
            out.push({
              id: `d-${e.id}`,
              date: e.data_inicio,
              kind: e.tipo || "outro",
              title: e.titulo || e.descricao || "Evento",
              source: "dados-internos",
            });
          }
        }

        // — mandato marcos —
        if (results[1].status === "fulfilled") {
          for (const m of results[1].value.data || []) {
            out.push({
              id: `m-${m.id}`,
              date: m.data,
              kind: m.tipo || "evento",
              title: m.titulo || m.descricao || "Marco",
              source: "mandato",
            });
          }
        }

        // — releases (InsightResponse: id, dataset, bullets, gerado_em) —
        if (results[2].status === "fulfilled") {
          for (const r of results[2].value.data || []) {
            // gerado_em is a datetime string — take date portion
            const date = r.gerado_em
              ? r.gerado_em.split("T")[0]
              : null;
            if (!date) continue;
            out.push({
              id: `r-${r.id}`,
              date,
              kind: "release",
              title: datasetLabel(r.dataset),
              source: "releases",
            });
          }
        }

        // sort by date ascending
        out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setEvents(out);
      })
      .catch((e) => setError(e))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return { events, loading, error };
}
