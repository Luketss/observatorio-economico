import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { PhotoIcon, PlusIcon } from "@heroicons/react/24/outline";
import AdminTable from "../../components/nid/AdminTable";
import AdminStats from "../../components/nid/AdminStats";
import BulkActions from "../../components/nid/BulkActions";
import AdminSearchInput from "../../components/nid/AdminSearchInput";
import AdminPagination from "../../components/nid/AdminPagination";
import NidModal, { NidField } from "../../components/nid/NidModal";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useSearchPagination } from "../../hooks/useSearchPagination";
import { useViewAs } from "../../context/ViewAsContext";

/** Match nome / código IBGE / UF (query already trimmed + lowercased by the hook) */
const matchMunicipio = (m, q) => {
  const norm = (s) => String(s ?? "").toLowerCase();
  return (
    norm(m.nome).includes(q) ||
    norm(m.codigo_ibge).includes(q) ||
    norm(m.estado).includes(q)
  );
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable relative time string for the most recent date in the list */
function mostRecentRelative(dates) {
  const valid = dates
    .map((d) => (d ? new Date(d) : null))
    .filter((d) => d && !isNaN(d));
  if (!valid.length) return "—";
  const latest = new Date(Math.max(...valid.map((d) => d.getTime())));
  const diffMs = Date.now() - latest.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `há ${diffD} d`;
  const diffM = Math.floor(diffD / 30);
  return `há ${diffM} mes${diffM !== 1 ? "es" : ""}`;
}

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
  const sp = useSearchPagination(municipios, matchMunicipio);
  const navigate = useNavigate();
  const { setViewAs } = useViewAs();

  // Add-município modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ nome: "", estado: "", codigo_ibge: "", clone_from_id: "" });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null);  // { id, nome } | null
  const [deleting, setDeleting] = useState(false);

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

  // ── Toggle is_demo (hides/shows município in cross-município analytics) ────
  const toggleDemo = async (municipio) => {
    const next = !municipio.is_demo;
    setSaving((prev) => ({ ...prev, [municipio.id]: true }));
    try {
      await api.put(`/municipios/${municipio.id}`, { is_demo: next });
      setMunicipios((prev) =>
        prev.map((m) => (m.id === municipio.id ? { ...m, is_demo: next } : m))
      );
    } catch {
      alert("Erro ao alterar status demo.");
    } finally {
      setSaving((prev) => ({ ...prev, [municipio.id]: false }));
    }
  };

  // ── Add município ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setAddForm({ nome: "", estado: "", codigo_ibge: "", clone_from_id: "" });
    setAddError("");
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!addForm.nome.trim() || !addForm.estado.trim()) {
      setAddError("Nome e UF são obrigatórios.");
      return;
    }
    setAddSubmitting(true);
    setAddError("");
    try {
      const body = {
        nome: addForm.nome.trim(),
        estado: addForm.estado.trim().toUpperCase().slice(0, 2),
        codigo_ibge: addForm.codigo_ibge.trim() || null,
        ativo: true,
      };
      if (addForm.clone_from_id) {
        body.clone_from_id = parseInt(addForm.clone_from_id, 10);
      }
      await api.post("/municipios/", body);
      setAddOpen(false);
      load();
    } catch (err) {
      setAddError(err?.response?.data?.detail || "Erro ao criar município.");
    } finally {
      setAddSubmitting(false);
    }
  };

  // ── View as (ADMIN_GLOBAL impersonation) ──────────────────────────────────
  const enterViewAs = (row) => {
    setViewAs(row.id, row.nome);
    navigate("/app");
  };

  // ── Delete município (cascade) ────────────────────────────────────────────
  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/municipios/${deleteTarget.id}`);
      setDeleteTarget(null);
      setMunicipios((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    } catch (err) {
      alert(err?.response?.data?.detail || "Erro ao excluir município.");
    } finally {
      setDeleting(false);
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
        primary: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {row.nome}
            {row.is_demo && (
              <span
                title="Município de demonstração — oculto dos comparativos públicos"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--admin-accent)",
                  background: "var(--admin-accent-soft)",
                  border: "1px solid color-mix(in oklab, var(--admin-accent) 35%, transparent)",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono)",
                }}
              >
                DEMO
              </span>
            )}
          </span>
        ),
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
      width: 180,
      actions: [
        {
          icon: "view",
          label: "Visualizar como (modo demo)",
          onClick: (row) => enterViewAs(row),
        },
        {
          icon: "edit",
          label: "Editar brasão",
          onClick: (row) => {
            fileRefs.current[row.id]?.click();
          },
        },
        {
          icon: "menu",
          label: "Mais ações",
          onClick: (row) => {
            const demoLabel = row.is_demo ? "Desmarcar demo (mostrar em comparativos)" : "Marcar como demo (ocultar dos comparativos)";
            const choice = window.prompt(
              `Ações para ${row.nome}:\n` +
              `1 — → ${planoLabel(nextPlano(row.plano))}\n` +
              `2 — Remover brasão${row.brasao ? "" : " (sem brasão)"}\n` +
              `3 — ${demoLabel}\n` +
              `\nDigite o número da ação:`
            );
            if (choice === "1") togglePlano(row);
            if (choice === "2" && row.brasao) removeBrasao(row);
            if (choice === "3") toggleDemo(row);
          },
        },
        {
          icon: "delete",
          label: "Excluir município",
          onClick: (row) => setDeleteTarget({ id: row.id, nome: row.nome }),
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
      <div
        className="nid-panel-head"
        style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
            Municípios
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            {municipios.length} cadastrado{municipios.length !== 1 ? "s" : ""}
            {municipios.filter((m) => m.plano !== "free").length > 0 &&
              ` · ${municipios.filter((m) => m.plano !== "free").length} em plano pago`}
            {sp.search && sp.filtered.length !== municipios.length &&
              ` · ${sp.filtered.length} resultado${sp.filtered.length !== 1 ? "s" : ""} para "${sp.search}"`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <AdminSearchInput
            value={sp.search}
            onChange={sp.setSearch}
            placeholder="Buscar município, UF, código IBGE…"
            ariaLabel="Buscar municípios"
          />
          <button
            type="button"
            onClick={openAdd}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px",
              background: "var(--admin-accent)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-display)",
            }}
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            Adicionar
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {(() => {
        const total = municipios.length;
        const paid = municipios.filter((m) => m.plano !== "free").length;
        const free = total - paid;
        const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
        const lastSync = mostRecentRelative(municipios.map((m) => m.updated_at));
        return (
          <AdminStats
            items={[
              { label: "Municípios", value: total },
              {
                label: "Pro / Premium",
                value: paid,
                unit: ` · ${paidPct}%`,
              },
              { label: "Última atualização", value: lastSync },
              {
                label: "Free",
                value: free,
                detail: free > 0 ? (
                  <span>
                    <span style={{ color: "var(--text-mute)" }}>● </span>sem plano pago
                  </span>
                ) : (
                  <span>
                    <span style={{ color: "var(--accent-1)" }}>● </span>todos pagos
                  </span>
                ),
              },
            ]}
          />
        );
      })()}

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
            data={sp.paged}
            rowKey={(row) => row.id}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyState={
              <span style={{ fontSize: 13, color: "var(--text-mute)" }}>
                {sp.search
                  ? `Nenhum município encontrado para "${sp.search}".`
                  : "Nenhum município cadastrado."}
              </span>
            }
          />
        )}
      </div>

      {!loading && (
        <AdminPagination
          filteredCount={sp.filtered.length}
          page={sp.page}
          setPage={sp.setPage}
          pageSize={sp.pageSize}
          setPageSize={sp.setPageSize}
          totalPages={sp.totalPages}
        />
      )}

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

      {/* Add município modal */}
      <NidModal
        open={addOpen}
        onClose={() => !addSubmitting && setAddOpen(false)}
        eyebrow="Novo município"
        title="Adicionar município"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              disabled={addSubmitting}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: addSubmitting ? "not-allowed" : "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitAdd}
              disabled={addSubmitting || !addForm.nome.trim() || !addForm.estado.trim()}
              style={{
                padding: "8px 14px",
                background: "var(--admin-accent)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: addSubmitting ? "wait" : "pointer",
                opacity: addSubmitting || !addForm.nome.trim() || !addForm.estado.trim() ? 0.6 : 1,
              }}
            >
              {addSubmitting
                ? (addForm.clone_from_id ? "Clonando datasets…" : "Criando…")
                : "Criar município"}
            </button>
          </>
        }
      >
        <NidField label="Nome">
          <input
            type="text"
            value={addForm.nome}
            onChange={(e) => setAddForm((p) => ({ ...p, nome: e.target.value }))}
            placeholder="Ex.: Demo · Cabo Verde"
            disabled={addSubmitting}
            autoFocus
          />
        </NidField>

        <NidField label="UF">
          <input
            type="text"
            value={addForm.estado}
            onChange={(e) => setAddForm((p) => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))}
            placeholder="MG"
            maxLength={2}
            disabled={addSubmitting}
            style={{ maxWidth: 100 }}
          />
        </NidField>

        <NidField label="Código IBGE (opcional)">
          <input
            type="text"
            value={addForm.codigo_ibge}
            onChange={(e) => setAddForm((p) => ({ ...p, codigo_ibge: e.target.value }))}
            placeholder="3109501"
            disabled={addSubmitting}
            style={{ maxWidth: 180 }}
          />
        </NidField>

        <NidField label="Clonar dados de (opcional)">
          <MunicipioPicker
            municipios={municipios}
            value={addForm.clone_from_id}
            onChange={(id) => setAddForm((p) => ({ ...p, clone_from_id: id }))}
            placeholder="Nenhum — município vazio"
            ariaLabel="Clonar dados de outro município"
          />
          <p style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 6, lineHeight: 1.4 }}>
            Se selecionado, todos os datasets do município de origem (insights, séries históricas,
            eventos, projetos) serão copiados para o novo município. Pode levar 10–30s.
            <br />
            <strong style={{ color: "var(--admin-accent)" }}>O novo município é marcado como demo automaticamente</strong>{" "}
            e fica oculto dos comparativos públicos. Você pode desmarcar pelo menu "Mais ações" depois.
          </p>
        </NidField>

        {addError && (
          <div style={{
            marginTop: 8, padding: "10px 12px",
            background: "color-mix(in oklab, var(--accent-2) 12%, transparent)",
            border: "1px solid color-mix(in oklab, var(--accent-2) 28%, transparent)",
            color: "var(--accent-2)", borderRadius: 8, fontSize: 12,
          }}>
            {addError}
          </div>
        )}
      </NidModal>

      {/* Delete confirmation modal */}
      <NidModal
        open={deleteTarget != null}
        onClose={() => !deleting && setDeleteTarget(null)}
        eyebrow="Atenção · ação irreversível"
        title={deleteTarget ? `Excluir "${deleteTarget.nome}"?` : ""}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitDelete}
              disabled={deleting}
              style={{
                padding: "8px 14px",
                background: "var(--accent-2)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: deleting ? "wait" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Excluindo…" : "Excluir definitivamente"}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
          Todos os dados deste município (insights, indicadores, séries históricas, eventos,
          projetos, cards customizados) serão removidos permanentemente. Esta ação não pode
          ser desfeita.
        </p>
      </NidModal>
    </motion.div>
  );
}
