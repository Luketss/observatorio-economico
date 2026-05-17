import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { PhotoIcon } from "@heroicons/react/24/outline";
import AdminTable from "../../components/nid/AdminTable";
import BulkActions from "../../components/nid/BulkActions";
import { useRowSelection } from "../../hooks/useRowSelection";

// ─── helpers ──────────────────────────────────────────────────────────────────

const PLANO_LABEL = { pro: "Pro", premium: "Premium", free: "Gratuito" };
const NEXT_PLANO = { free: "pro", pro: "premium", premium: "free" };

function planoLabel(p) { return PLANO_LABEL[p] ?? p; }
function nextPlano(p)  { return NEXT_PLANO[p] ?? "pro"; }

/** Client-side CSV export for selected rows */
function exportCsv(rows) {
  const cols = ["id", "nome", "estado", "codigo_ibge", "plano", "updated_at"];
  const header = ["ID", "Município", "UF", "Cód. IBGE", "Plano", "Última atualização"];
  const lines = [
    header.join(";"),
    ...rows.map((r) =>
      cols.map((c) => {
        const v = r[c] ?? "";
        // Escape quotes and wrap strings with commas/quotes in quotes
        const s = String(v).replace(/"/g, '""');
        return s.includes(";") || s.includes('"') ? `"${s}"` : s;
      }).join(";")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `municipios-selecionados-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Brasão cell ──────────────────────────────────────────────────────────────

function BrasaoCell({ m }) {
  if (m.brasao) {
    return (
      <img
        src={m.brasao}
        alt={`Brasão ${m.nome}`}
        style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 36, height: 36, borderRadius: 6,
        border: "1.5px dashed var(--border-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <PhotoIcon style={{ width: 16, height: 16, color: "var(--text-mute)" }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MunicipiosAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // { [id]: bool, [brasao_id]: bool }
  const fileRefs = useRef({});

  const { selectedIds, setSelectedIds, clear, count } = useRowSelection();

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = () => {
    setLoading(true);
    api
      .get("/municipios")
      .then((r) => setMunicipios(r.data || []))
      .catch(() => setMunicipios([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Per-row plano change (used by row action dropdown) ────────────────────
  const changePlano = async (municipio, novoPlano) => {
    setSaving((prev) => ({ ...prev, [municipio.id]: true }));
    try {
      await api.put(`/municipios/${municipio.id}`, { plano: novoPlano });
      setMunicipios((prev) =>
        prev.map((m) => (m.id === municipio.id ? { ...m, plano: novoPlano } : m))
      );
    } catch {
      alert("Erro ao alterar plano.");
    } finally {
      setSaving((prev) => ({ ...prev, [municipio.id]: false }));
    }
  };

  // Keep old cycle-on-click behaviour available for the row "→ <next>" action
  const togglePlano = (municipio) => changePlano(municipio, nextPlano(municipio.plano));

  // ── Brasão management ─────────────────────────────────────────────────────
  const handleBrasaoChange = async (municipio, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      setSaving((prev) => ({ ...prev, [`brasao_${municipio.id}`]: true }));
      try {
        await api.put(`/municipios/${municipio.id}`, { brasao: base64 });
        setMunicipios((prev) =>
          prev.map((m) => (m.id === municipio.id ? { ...m, brasao: base64 } : m))
        );
      } catch {
        alert("Erro ao salvar brasão.");
      } finally {
        setSaving((prev) => ({ ...prev, [`brasao_${municipio.id}`]: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const removeBrasao = async (municipio) => {
    setSaving((prev) => ({ ...prev, [`brasao_${municipio.id}`]: true }));
    try {
      await api.put(`/municipios/${municipio.id}`, { brasao: null });
      setMunicipios((prev) =>
        prev.map((m) => (m.id === municipio.id ? { ...m, brasao: null } : m))
      );
    } catch {
      alert("Erro ao remover brasão.");
    } finally {
      setSaving((prev) => ({ ...prev, [`brasao_${municipio.id}`]: false }));
    }
  };

  // ── Bulk operations ───────────────────────────────────────────────────────

  /** Promote all selected rows to a given plano via Promise.all (per-row endpoint) */
  const bulkSetPlano = async (novoPlano) => {
    const targets = municipios.filter((m) => selectedIds.has(m.id));
    if (targets.length === 0) return;
    const ids = targets.map((m) => m.id);
    // Mark all as saving
    setSaving((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = true; });
      return next;
    });
    try {
      await Promise.all(
        targets.map((m) => api.put(`/municipios/${m.id}`, { plano: novoPlano }))
      );
      setMunicipios((prev) =>
        prev.map((m) => (selectedIds.has(m.id) ? { ...m, plano: novoPlano } : m))
      );
      clear();
    } catch {
      alert(`Erro ao promover municípios para ${planoLabel(novoPlano)}.`);
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        ids.forEach((id) => { next[id] = false; });
        return next;
      });
    }
  };

  /** Export CSV of selected rows */
  const bulkExportCsv = () => {
    const targets = municipios.filter((m) => selectedIds.has(m.id));
    exportCsv(targets);
  };

  // TODO (ticket 22+): bulk Suspender — no `suspenso` flag exists on the
  // /municipios endpoint today. When the API exposes a `suspenso` boolean or a
  // dedicated PATCH /municipios/bulk-suspend endpoint, wire it here with a
  // window.confirm() guard and call clear() on success.
  // const bulkSuspend = async () => { ... }

  // ── Column definition ─────────────────────────────────────────────────────
  const columns = [
    { key: "_select", kind: "checkbox", width: 36 },
    {
      key: "nome",
      label: "Município",
      kind: "avatar+text",
      render: (row) => ({
        avatar: <BrasaoCell m={row} />,
        primary: row.nome,
        secondary: row.codigo_ibge || undefined,
      }),
    },
    { key: "estado", label: "UF", mono: true, width: 56 },
    {
      key: "plano",
      label: "Plano",
      kind: "pill",
      pillKind: (row) => row.plano ?? "free",
      pillLabel: (row) => planoLabel(row.plano),
    },
    {
      // Datasets cobertos — field not yet available in API; show — until exposed
      key: "_datasets",
      label: "Datasets",
      mono: true,
      render: (row) =>
        row.datasets_cobertos != null && row.datasets_total != null
          ? `${row.datasets_cobertos} / ${row.datasets_total}`
          : null, // AdminTable renders — for null
    },
    {
      // Última sync — use updated_at if present
      key: "updated_at",
      label: "Última sync",
      kind: "relative-time",
    },
    {
      // Status — fixed "ok" / Ativo until sync-health business logic is wired
      key: "_status",
      label: "Status",
      kind: "pill",
      pillKind: (row) => {
        // Future: derive from row.sync_status or row.last_sync_error
        if (row.sync_status === "warn") return "warn";
        if (row.sync_status === "err")  return "err";
        return "ok";
      },
      pillLabel: (row) => {
        if (row.sync_status === "warn") return "Sync atrasada";
        if (row.sync_status === "err")  return "Falha · comex";
        return "Ativo";
      },
    },
    {
      key: "_actions",
      kind: "row-actions",
      width: 100,
      actions: [
        {
          icon: "edit",
          label: "Editar brasão",
          onClick: (row) => {
            // Trigger the hidden file input for this row
            fileRefs.current[row.id]?.click();
          },
        },
        {
          icon: "menu",
          label: "Mais ações",
          onClick: (row) => {
            // Simple inline action menu via window prompt (ticket 22 will add a proper modal)
            const choice = window.prompt(
              `Ações para ${row.nome}:\n` +
              `1 — → ${planoLabel(nextPlano(row.plano))}\n` +
              `2 — Remover brasão${row.brasao ? "" : " (sem brasão)"}\n` +
              `\nDigite o número da ação:`
            );
            if (choice === "1") togglePlano(row);
            if (choice === "2" && row.brasao) removeBrasao(row);
          },
        },
      ],
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Page header */}
      <div className="nid-panel-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
            Municípios
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            {municipios.length} cadastrado{municipios.length !== 1 ? "s" : ""}
            {municipios.filter((m) => m.plano !== "free").length > 0 &&
              ` · ${municipios.filter((m) => m.plano !== "free").length} em plano pago`}
          </p>
        </div>
      </div>

      {/* Bulk toolbar — renders nothing when count === 0 */}
      <BulkActions count={count} onClear={clear}>
        <button
          className="rowact-btn"
          style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "var(--admin-accent-soft)", border: "1px solid color-mix(in oklab, var(--admin-accent) 35%, transparent)", color: "var(--admin-accent)", borderRadius: 8, cursor: "pointer" }}
          onClick={() => bulkSetPlano("pro")}
        >
          Promover → Pro
        </button>
        <button
          className="rowact-btn"
          style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "color-mix(in oklab, var(--accent-4) 14%, transparent)", border: "1px solid color-mix(in oklab, var(--accent-4) 28%, transparent)", color: "var(--accent-4)", borderRadius: 8, cursor: "pointer" }}
          onClick={() => bulkSetPlano("premium")}
        >
          Promover → Premium
        </button>
        <button
          className="rowact-btn"
          style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: 8, cursor: "pointer" }}
          onClick={bulkExportCsv}
        >
          Exportar CSV
        </button>
        {/* TODO: Suspender bulk — add when API exposes suspenso flag */}
      </BulkActions>

      {/* Table */}
      <div className="nid-panel" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ height: 56, borderRadius: 10, background: "var(--panel-2)", animation: "pulse 1.5s ease-in-out infinite" }}
              />
            ))}
          </div>
        ) : (
          <AdminTable
            columns={columns}
            data={municipios}
            rowKey={(row) => row.id}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyState={
              <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
                Nenhum município cadastrado.
              </span>
            }
          />
        )}
      </div>

      {/* Hidden file inputs for brasão upload — one per row, rendered outside the table */}
      {municipios.map((m) => (
        <input
          key={m.id}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          ref={(el) => (fileRefs.current[m.id] = el)}
          onChange={(e) => handleBrasaoChange(m, e.target.files?.[0])}
        />
      ))}
    </motion.div>
  );
}
