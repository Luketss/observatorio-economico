import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../services/api";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  FlagIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const TIPOS = [
  { value: "inicio_mandato", label: "Início de Mandato" },
  { value: "obras", label: "Obras" },
  { value: "politica", label: "Política Pública" },
  { value: "evento", label: "Evento" },
];

const TIPO_COLORS = {
  inicio_mandato: "bg-blue-100 text-blue-700",
  obras: "bg-orange-100 text-orange-700",
  politica: "bg-green-100 text-green-700",
  evento: "bg-slate-100 text-slate-600",
};

const EMPTY_FORM = { data: "", titulo: "", descricao: "", tipo: "evento" };

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function MandatoAdminPage() {
  const [marcos, setMarcos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // marco object or null
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get("/marcos")
      .then((r) => setMarcos(r.data || []))
      .catch(() => setMarcos([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (marco) => {
    setEditing(marco);
    setForm({
      data: marco.data,
      titulo: marco.titulo,
      descricao: marco.descricao || "",
      tipo: marco.tipo,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.put(`/marcos/${editing.id}`, form);
      } else {
        await api.post("/marcos", form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar marco.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este marco?")) return;
    try {
      await api.delete(`/marcos/${id}`);
      load();
    } catch {
      alert("Erro ao excluir marco.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            Timeline do Mandato
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Gerencie marcos, obras e eventos do mandato.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Novo Marco
        </button>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  {editing ? "Editar Marco" : "Novo Marco"}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.data}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Tipo *
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Título *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    placeholder="Ex: Início da obra do novo hospital"
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Descrição
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Detalhes adicionais (opcional)"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : marcos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FlagIcon className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum marco cadastrado</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Clique em "Novo Marco" para começar.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                <th className="px-3 py-3 md:px-6">Data</th>
                <th className="px-3 py-3 md:px-6">Tipo</th>
                <th className="px-3 py-3 md:px-6">Título</th>
                <th className="px-3 py-3 md:px-6">Descrição</th>
                <th className="px-3 py-3 md:px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {marcos.map((marco) => (
                <tr key={marco.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-3 py-4 md:px-6 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {fmtDate(marco.data)}
                  </td>
                  <td className="px-3 py-4 md:px-6">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${TIPO_COLORS[marco.tipo] || "bg-slate-100 text-slate-600"}`}>
                      {TIPOS.find((t) => t.value === marco.tipo)?.label || marco.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-4 md:px-6 font-medium text-slate-800 dark:text-white">{marco.titulo}</td>
                  <td className="px-3 py-4 md:px-6 text-slate-400 dark:text-slate-500 max-w-xs truncate">
                    {marco.descricao || "—"}
                  </td>
                  <td className="px-3 py-4 md:px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(marco)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(marco.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
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
