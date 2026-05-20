import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

/**
 * ADMIN_GLOBAL page to manage per-dataset ingestion metadata:
 * the data source ("fonte") and the update/reference date ("data de
 * atualização"). Shown to users via DatasetSourceBadge on each data page.
 */
export default function DatasetFontesAdminPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/municipios/datasets"), api.get("/dataset-info/all")])
      .then(([catalogRes, infoRes]) => {
        const infoByKey = Object.fromEntries(
          (infoRes.data || []).map((i) => [i.dataset, i])
        );
        const merged = (catalogRes.data || []).map((d) => {
          const info = infoByKey[d.key] || {};
          return {
            key: d.key,
            label: d.label,
            fonte: info.fonte || "",
            data_atualizacao: info.data_atualizacao || "",
          };
        });
        setRows(merged);
      })
      .catch(() => addToast("Erro ao carregar fontes de dados.", "error"))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async (row) => {
    setSavingKey(row.key);
    try {
      await api.put(`/dataset-info/${row.key}`, {
        fonte: row.fonte,
        data_atualizacao: row.data_atualizacao,
      });
      addToast(`Fonte de "${row.label}" salva.`, "success");
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao salvar.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleClear = async (row) => {
    if (!confirm(`Limpar fonte e data de atualização de "${row.label}"?`)) return;
    setSavingKey(row.key);
    try {
      await api.delete(`/dataset-info/${row.key}`);
      updateField(row.key, "fonte", "");
      updateField(row.key, "data_atualizacao", "");
      addToast(`Fonte de "${row.label}" removida.`, "success");
    } catch (err) {
      // 404 means there was nothing stored yet — treat as already clear.
      if (err.response?.status === 404) {
        updateField(row.key, "fonte", "");
        updateField(row.key, "data_atualizacao", "");
      } else {
        addToast(err.response?.data?.detail || "Erro ao remover.", "error");
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Fontes de Dados
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Defina a fonte e a data de atualização de cada conjunto de dados de
          ingestão. Essas informações aparecem como tooltip nas páginas de dados.
        </p>
      </div>

      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--text-dim)]">
            Carregando...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Conjunto de dados</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Fonte</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Data de atualização</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--text)] align-middle">
                    {row.label}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.fonte}
                      onChange={(e) => updateField(row.key, "fonte", e.target.value)}
                      placeholder="Ex.: IBGE — SIDRA"
                      maxLength={200}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.data_atualizacao}
                      onChange={(e) => updateField(row.key, "data_atualizacao", e.target.value)}
                      placeholder="Ex.: Março/2026 ou Ano-base 2024"
                      maxLength={60}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSave(row)}
                        disabled={savingKey === row.key}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                        aria-label={`Salvar fonte de ${row.label}`}
                      >
                        <CheckIcon className="w-4 h-4" />
                        Salvar
                      </button>
                      <button
                        onClick={() => handleClear(row)}
                        disabled={savingKey === row.key || (!row.fonte && !row.data_atualizacao)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40"
                        aria-label={`Limpar fonte de ${row.label}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}
