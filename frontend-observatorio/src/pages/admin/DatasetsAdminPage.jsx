import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrashIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import NidModal, { NidField } from "../../components/nid/NidModal";
import { useToast } from "../../context/ToastContext";

const CONFIRM_PHRASE = "DELETAR";

function formatCount(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(n);
}

export default function DatasetsAdminPage() {
  const { addToast } = useToast();

  const [municipios, setMunicipios] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [selectedMunId, setSelectedMunId] = useState("");
  const [counts, setCounts] = useState({});
  const [loadingMun, setLoadingMun] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap: load municípios + dataset catalog
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [munRes, dsRes] = await Promise.all([
          api.get("/municipios"),
          api.get("/municipios/datasets"),
        ]);
        if (cancelled) return;
        const sorted = [...munRes.data].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR")
        );
        setMunicipios(sorted);
        setDatasets(dsRes.data);
      } catch (err) {
        if (!cancelled) addToast("Falha ao carregar dados iniciais", "error");
      } finally {
        if (!cancelled) setLoadingMun(false);
      }
    })();
    return () => { cancelled = true; };
  }, [addToast]);

  const refreshSummary = useCallback(async (mid) => {
    if (!mid) {
      setCounts({});
      return;
    }
    setLoadingSummary(true);
    try {
      const res = await api.get(`/municipios/${mid}/datasets-summary`);
      setCounts(res.data?.counts || {});
    } catch (err) {
      addToast("Falha ao carregar resumo de datasets", "error");
      setCounts({});
    } finally {
      setLoadingSummary(false);
    }
  }, [addToast]);

  useEffect(() => {
    refreshSummary(selectedMunId);
  }, [selectedMunId, refreshSummary]);

  const selectedMun = municipios.find((m) => String(m.id) === String(selectedMunId));

  const openDelete = (dataset) => {
    setDeleteTarget(dataset);
    setConfirmInput("");
  };

  const closeDelete = () => {
    if (submitting) return;
    setDeleteTarget(null);
    setConfirmInput("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selectedMunId || confirmInput !== CONFIRM_PHRASE) return;
    setSubmitting(true);
    try {
      const res = await api.delete(
        `/municipios/${selectedMunId}/datasets/${deleteTarget.key}`
      );
      const totalDeleted = Object.values(res.data?.summary || {}).reduce(
        (a, b) => a + b, 0
      );
      addToast(
        `${deleteTarget.label}: ${formatCount(totalDeleted)} linha(s) removida(s)`,
        "success"
      );
      setDeleteTarget(null);
      setConfirmInput("");
      await refreshSummary(selectedMunId);
    } catch (err) {
      addToast(
        err.response?.data?.detail || "Falha ao limpar dataset",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Intro */}
      <div
        className="rounded-xl p-4"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
        }}
      >
        <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>
          Limpar dados por dataset
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
          Apague todas as linhas de um dataset (por exemplo, Arrecadação) para um
          município específico, sem afetar outros datasets ou dados operacionais
          (projetos, indicadores internos, cards). Útil para reingerir um CSV
          corrigido. <b>Ação irreversível.</b>
        </p>
      </div>

      {/* Município picker */}
      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
        }}
      >
        <label
          htmlFor="municipio-select"
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Município:
        </label>
        <select
          id="municipio-select"
          value={selectedMunId}
          onChange={(e) => setSelectedMunId(e.target.value)}
          disabled={loadingMun}
          className="flex-1 px-3 py-2 rounded-lg text-sm cursor-pointer"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <option value="">
            {loadingMun ? "Carregando…" : "— selecione um município —"}
          </option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} ({m.estado}){m.is_demo ? " · demo" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Datasets table */}
      {selectedMunId ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
          }}
        >
          <table className="w-full text-sm">
            <thead style={{ background: "var(--panel-2)" }}>
              <tr>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-dim)" }}>
                  Dataset
                </th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "var(--text-dim)" }}>
                  Linhas
                </th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "var(--text-dim)" }}>
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds, idx) => {
                const count = counts[ds.key];
                const empty = !count;
                return (
                  <tr
                    key={ds.key}
                    style={{
                      borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: "var(--text)" }}>
                      {ds.label}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{ color: empty ? "var(--text-mute)" : "var(--text)" }}
                    >
                      {loadingSummary ? "…" : formatCount(count || 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDelete(ds)}
                        disabled={empty || loadingSummary}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: "color-mix(in oklab, #ef4444 12%, transparent)",
                          border: "1px solid color-mix(in oklab, #ef4444 35%, transparent)",
                          color: "#ef4444",
                        }}
                        aria-label={`Limpar dados de ${ds.label}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Limpar dados
                      </button>
                    </td>
                  </tr>
                );
              })}
              {datasets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center" style={{ color: "var(--text-mute)" }}>
                    Nenhum dataset disponível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "var(--panel)",
            border: "1px dashed var(--border-strong)",
            color: "var(--text-mute)",
          }}
        >
          Selecione um município para visualizar e limpar datasets.
        </div>
      )}

      {/* Confirm modal */}
      <NidModal
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        eyebrow="Atenção · ação irreversível"
        title={deleteTarget ? `Limpar ${deleteTarget.label}` : ""}
        size="md"
        footer={
          <>
            <button
              onClick={closeDelete}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              disabled={submitting || confirmInput !== CONFIRM_PHRASE}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "#ef4444",
                color: "#fff",
                border: "1px solid #dc2626",
              }}
            >
              {submitting ? "Limpando…" : "Limpar definitivamente"}
            </button>
          </>
        }
      >
        {deleteTarget && selectedMun && (
          <div className="space-y-3">
            <p style={{ color: "var(--text-dim)" }}>
              Você vai apagar <b>todas as linhas</b> de{" "}
              <b style={{ color: "var(--text)" }}>{deleteTarget.label}</b> para{" "}
              <b style={{ color: "var(--text)" }}>
                {selectedMun.nome} ({selectedMun.estado})
              </b>
              . Em seguida, rode o loader de ingestão para repopular com o CSV
              corrigido.
            </p>
            <p style={{ color: "var(--text-dim)" }}>
              Linhas a remover:{" "}
              <b style={{ color: "var(--text)" }}>
                {formatCount(counts[deleteTarget.key] || 0)}
              </b>
              .
            </p>
            <NidField label={`Digite ${CONFIRM_PHRASE} para confirmar`}>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                }}
              />
            </NidField>
          </div>
        )}
      </NidModal>
    </motion.div>
  );
}
