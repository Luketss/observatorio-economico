import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import NidModal from "../../components/nid/NidModal";
import { INDICADOR_CATALOG } from "../../utils/indicadorCatalog";
import { filtrarGrupos, mesclarCatalogoComBanco } from "../../utils/indicadorAdmin";

/**
 * ADMIN_GLOBAL: preenchimento em lote dos tooltips/descrições de KPIs e
 * gráficos (indicador_info — global, vale para todos os municípios).
 */
export default function IndicadoresAdminPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [soVazios, setSoVazios] = useState(false);
  const [editando, setEditando] = useState(null); // { dataset, key, label, tooltip, descricao, fonte }
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .get("/indicadores/all")
      .then((r) => setRows(r.data || []))
      .catch(() => addToast("Erro ao carregar indicadores.", "error"))
      .finally(() => setLoading(false));

  useEffect(() => { carregar(); }, []);

  const { grupos, orfaos } = useMemo(
    () => mesclarCatalogoComBanco(INDICADOR_CATALOG, rows),
    [rows]
  );
  const visiveis = useMemo(
    () => filtrarGrupos(grupos, { busca, soVazios }),
    [grupos, busca, soVazios]
  );
  const totais = useMemo(() => {
    const todas = grupos.flatMap((g) => g.entries);
    return { total: todas.length, preenchidos: todas.filter((e) => e.preenchido).length };
  }, [grupos]);

  const salvar = async () => {
    if (!editando || salvando) return;
    setSalvando(true);
    try {
      await api.put(`/indicadores/${editando.dataset}/${editando.key}`, {
        tooltip: editando.tooltip,
        descricao: editando.descricao,
        fonte: editando.fonte,
      });
      addToast(`"${editando.label}" salvo.`, "success");
      setEditando(null);
      carregar();
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao salvar.", "error");
    } finally {
      setSalvando(false);
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
          Indicadores & Tooltips
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Explicações de KPIs e gráficos exibidas a todos os municípios — tooltip curto
          (hover), descrição completa (modal) e fonte. {totais.preenchidos}/{totais.total} preenchidos.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, chave, conteúdo…"
          className="w-72 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
          aria-label="Buscar indicador"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
          <input
            type="checkbox"
            checked={soVazios}
            onChange={(e) => setSoVazios(e.target.checked)}
            className="rounded"
          />
          Só sem descrição
        </label>
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center text-[var(--text-dim)]">Carregando...</div>
      ) : (
        visiveis.map((g) => (
          <div key={g.dataset} className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-bold uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]">
              {g.dataset}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {g.entries.map((e) => (
                  <tr key={e.key} className="border-b border-[var(--border)] last:border-0 align-top">
                    <td className="px-4 py-3 w-64">
                      <p className="font-medium text-[var(--text)]">{e.label}</p>
                      <p className="text-xs text-[var(--text-mute)]">
                        {e.key} · {e.tipo === "chart" ? "gráfico" : "KPI"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {e.preenchido ? (
                        <p className="text-[var(--text-dim)] line-clamp-2">{e.tooltip || e.descricao}</p>
                      ) : (
                        <span className="text-xs italic text-[var(--text-mute)]">Sem descrição</span>
                      )}
                    </td>
                    <td className="px-4 py-3 w-28 text-right">
                      <button
                        onClick={() => setEditando({ dataset: g.dataset, ...e })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: "color-mix(in oklab, var(--admin-accent, #3b82f6) 12%, transparent)",
                          border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 35%, transparent)",
                          color: "var(--admin-accent, #3b82f6)",
                        }}
                        aria-label={`Editar ${e.label}`}
                      >
                        {e.preenchido ? "Editar" : "Preencher"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {orfaos.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Chaves fora do catálogo</h2>
          <p className="text-xs text-[var(--text-mute)] mb-2">
            Existem no banco mas nenhuma tela usa (sobras de renomeações). Nada é apagado automaticamente.
          </p>
          <ul className="text-xs text-[var(--text-dim)] space-y-1">
            {orfaos.map((o) => (
              <li key={`${o.dataset}-${o.indicador_key}`}>
                <code>{o.dataset}.{o.indicador_key}</code>
                {o.tooltip ? ` — ${o.tooltip}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <NidModal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        eyebrow={editando ? `${editando.dataset} · ${editando.key}` : ""}
        title={editando?.label || ""}
        size="md"
        footer={
          <>
            <button
              onClick={() => setEditando(null)}
              className="px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{
                background: "var(--admin-accent, #3b82f6)", color: "#fff",
                border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)",
              }}
            >
              <CheckIcon className="w-4 h-4" />
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {editando && (
          <div className="space-y-3">
            <label className="block text-sm text-[var(--text-dim)]">
              Tooltip (curto, máx. 250)
              <input
                value={editando.tooltip}
                onChange={(e) => setEditando((p) => ({ ...p, tooltip: e.target.value }))}
                maxLength={250}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-[var(--text-dim)]">
              Descrição completa
              <textarea
                value={editando.descricao}
                onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
                rows={5}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm resize-none"
              />
            </label>
            <label className="block text-sm text-[var(--text-dim)]">
              Fonte
              <input
                value={editando.fonte}
                onChange={(e) => setEditando((p) => ({ ...p, fonte: e.target.value }))}
                placeholder="Ex.: IBGE — SIDRA"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
      </NidModal>
    </motion.div>
  );
}
