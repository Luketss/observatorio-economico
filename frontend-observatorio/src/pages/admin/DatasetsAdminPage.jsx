import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrashIcon, ArrowUpTrayIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import NidModal, { NidField } from "../../components/nid/NidModal";
import MunicipioPicker from "../../components/nid/MunicipioPicker";
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

  // Bulk: wipe the whole ingestion (all datasets) for the município
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Data-sanity findings for the selected município
  const [sanidade, setSanidade] = useState([]);

  // Re-ingestion (CSV upload) per dataset
  const [reingestTarget, setReingestTarget] = useState(null);
  const [reingestFiles, setReingestFiles] = useState(null);
  const [reingestSubmitting, setReingestSubmitting] = useState(false);

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
      setSanidade([]);
      return;
    }
    setLoadingSummary(true);
    try {
      const [sumRes, sanRes] = await Promise.all([
        api.get(`/municipios/${mid}/datasets-summary`),
        api.get(`/municipios/${mid}/sanidade`),
      ]);
      setCounts(sumRes.data?.counts || {});
      setSanidade(sanRes.data || []);
    } catch (err) {
      addToast("Falha ao carregar resumo de datasets", "error");
      setCounts({});
      setSanidade([]);
    } finally {
      setLoadingSummary(false);
    }
  }, [addToast]);

  const closeReingest = () => {
    if (reingestSubmitting) return;
    setReingestTarget(null);
    setReingestFiles(null);
  };

  const confirmReingest = async () => {
    if (!reingestTarget || !selectedMunId || !reingestFiles?.length) return;
    setReingestSubmitting(true);
    try {
      const fd = new FormData();
      Array.from(reingestFiles).forEach((f) => fd.append("files", f));
      const res = await api.post(
        `/municipios/${selectedMunId}/datasets/${reingestTarget.key}/reingest`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      addToast(
        `${reingestTarget.label}: ${formatCount(res.data?.linhas_inseridas || 0)} linha(s) reingeridas (removidas ${formatCount(res.data?.linhas_removidas || 0)})`,
        "success"
      );
      setReingestTarget(null);
      setReingestFiles(null);
      await refreshSummary(selectedMunId);
    } catch (err) {
      addToast(err.response?.data?.detail || "Falha ao reprocessar dataset", "error");
    } finally {
      setReingestSubmitting(false);
    }
  };

  useEffect(() => {
    refreshSummary(selectedMunId);
  }, [selectedMunId, refreshSummary]);

  const selectedMun = municipios.find((m) => String(m.id) === String(selectedMunId));

  const totalRows = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  const closeBulk = () => {
    if (bulkSubmitting) return;
    setBulkOpen(false);
    setBulkConfirm("");
  };

  const confirmBulkDelete = async () => {
    if (!selectedMun || bulkConfirm.trim() !== selectedMun.nome) return;
    setBulkSubmitting(true);
    try {
      const res = await api.delete(`/municipios/${selectedMunId}/datasets`);
      const totalDeleted = Object.values(res.data?.summary || {}).reduce(
        (a, b) => a + b, 0
      );
      addToast(
        `Ingestão de ${selectedMun.nome} apagada: ${formatCount(totalDeleted)} linha(s) removida(s)`,
        "success"
      );
      setBulkOpen(false);
      setBulkConfirm("");
      await refreshSummary(selectedMunId);
    } catch (err) {
      addToast(
        err.response?.data?.detail || "Falha ao apagar a ingestão",
        "error"
      );
    } finally {
      setBulkSubmitting(false);
    }
  };

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
          município específico — ou use <b>"Apagar toda a ingestão"</b> para limpar
          todos os datasets de uma vez. Em ambos os casos, os dados operacionais
          (projetos, indicadores internos, cards) e o município são preservados.
          Útil para reingerir CSVs corrigidos. <b>Ação irreversível.</b>
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
        <div className="flex-1">
          <MunicipioPicker
            municipios={municipios}
            value={selectedMunId}
            onChange={setSelectedMunId}
            placeholder={loadingMun ? "Carregando…" : "— selecione um município —"}
          />
        </div>

        {selectedMunId && (
          <button
            onClick={() => { setBulkConfirm(""); setBulkOpen(true); }}
            disabled={loadingSummary || totalRows === 0}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#ef4444", color: "#fff", border: "1px solid #dc2626" }}
            aria-label="Apagar toda a ingestão do município"
            title={totalRows === 0 ? "Município sem dados de ingestão" : "Apagar todos os datasets deste município"}
          >
            <TrashIcon className="w-4 h-4" />
            Apagar toda a ingestão
          </button>
        )}
      </div>

      {/* Data-sanity diagnostics */}
      {selectedMunId && sanidade.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--panel)",
            border: "1px solid color-mix(in oklab, #f59e0b 40%, var(--border))",
          }}
        >
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <ExclamationTriangleIcon className="w-4 h-4" style={{ color: "#f59e0b" }} />
            Diagnóstico de dados ({sanidade.length})
          </h3>
          <ul className="mt-2 space-y-1.5">
            {sanidade.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span style={{ color: s.nivel === "erro" ? "#ef4444" : "#f59e0b", lineHeight: 1.5 }}>
                  {s.nivel === "erro" ? "✕" : "⚠"}
                </span>
                <span style={{ color: "var(--text-dim)" }}>
                  <b style={{ color: "var(--text)" }}>{s.dataset}</b> — {s.mensagem}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setReingestTarget(ds); setReingestFiles(null); }}
                          disabled={loadingSummary}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: "color-mix(in oklab, var(--admin-accent, #3b82f6) 12%, transparent)",
                            border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 35%, transparent)",
                            color: "var(--admin-accent, #3b82f6)",
                          }}
                          aria-label={`Reprocessar ${ds.label}`}
                          title="Enviar CSV corrigido e reingerir"
                        >
                          <ArrowUpTrayIcon className="w-4 h-4" />
                          Reprocessar
                        </button>
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
                      </div>
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

      {/* Bulk confirm modal — wipe the whole ingestion */}
      <NidModal
        open={bulkOpen}
        onClose={closeBulk}
        eyebrow="Atenção · ação irreversível"
        title={selectedMun ? `Apagar toda a ingestão de ${selectedMun.nome}` : ""}
        size="md"
        footer={
          <>
            <button
              onClick={closeBulk}
              disabled={bulkSubmitting}
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
              onClick={confirmBulkDelete}
              disabled={bulkSubmitting || !selectedMun || bulkConfirm.trim() !== selectedMun.nome}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "#ef4444",
                color: "#fff",
                border: "1px solid #dc2626",
              }}
            >
              {bulkSubmitting ? "Apagando…" : "Apagar definitivamente"}
            </button>
          </>
        }
      >
        {selectedMun && (
          <div className="space-y-3">
            <p style={{ color: "var(--text-dim)" }}>
              Você vai apagar <b>todos os datasets</b> (toda a ingestão) de{" "}
              <b style={{ color: "var(--text)" }}>
                {selectedMun.nome} ({selectedMun.estado})
              </b>
              . Dados operacionais (projetos, indicadores internos, marcos, insights,
              cards) e o município <b>são preservados</b>. Em seguida, rode os loaders
              de ingestão para repopular com os CSVs corretos.
            </p>
            <p style={{ color: "var(--text-dim)" }}>
              Linhas a remover:{" "}
              <b style={{ color: "var(--text)" }}>{formatCount(totalRows)}</b>.
            </p>
            <NidField label={`Digite o nome do município (${selectedMun.nome}) para confirmar`}>
              <input
                type="text"
                value={bulkConfirm}
                onChange={(e) => setBulkConfirm(e.target.value)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                }}
              />
            </NidField>
          </div>
        )}
      </NidModal>

      {/* Re-ingestion (CSV upload) modal */}
      <NidModal
        open={Boolean(reingestTarget)}
        onClose={closeReingest}
        eyebrow="Reprocessar dataset"
        title={reingestTarget ? `Reingerir ${reingestTarget.label}` : ""}
        size="md"
        footer={
          <>
            <button
              onClick={closeReingest}
              disabled={reingestSubmitting}
              className="px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmReingest}
              disabled={reingestSubmitting || !reingestFiles?.length}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent, #3b82f6)", color: "#fff", border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)" }}
            >
              {reingestSubmitting ? "Reingerindo…" : "Enviar e reingerir"}
            </button>
          </>
        }
      >
        {reingestTarget && selectedMun && (
          <div className="space-y-3">
            <p style={{ color: "var(--text-dim)" }}>
              Envie o(s) CSV(s) corrigido(s) de{" "}
              <b style={{ color: "var(--text)" }}>{reingestTarget.label}</b> para{" "}
              <b style={{ color: "var(--text)" }}>{selectedMun.nome} ({selectedMun.estado})</b>.
              O sistema valida o <b>codigo_ibge</b> do arquivo contra o município (bloqueia
              carga na cidade errada), apaga as linhas atuais do dataset e reingere.
            </p>
            <p className="text-xs" style={{ color: "var(--text-mute)" }}>
              Use os mesmos nomes de arquivo do loader (ex.: <code>{reingestTarget.key}.csv</code>;
              para Empresas: <code>estabelecimentos.csv</code>, <code>empresas.csv</code>, <code>simples.csv</code>).
            </p>
            <NidField label="Arquivo(s) CSV">
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={(e) => setReingestFiles(e.target.files)}
                className="w-full text-sm"
                style={{ color: "var(--text)" }}
              />
            </NidField>
            {reingestFiles?.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {reingestFiles.length} arquivo(s): {Array.from(reingestFiles).map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
        )}
      </NidModal>
    </motion.div>
  );
}
