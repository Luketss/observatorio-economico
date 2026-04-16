import { useEffect, useState } from "react";
import api from "../../services/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const TIPO_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Aviso" },
  { value: "alert", label: "Alerta" },
];

const TIPO_STYLES = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  alert: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const EMPTY_FORM = {
  titulo: "",
  mensagem: "",
  tipo: "info",
  destino: "todos",
  municipio_ids: [],
  expira_em: "",
};

export default function NotificacoesAdminPage() {
  const [notifs, setNotifs] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | "edit"
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [acting, setActing] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchNotifs = () =>
    api
      .get("/notificacoes/admin")
      .then((r) => setNotifs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchNotifs();
    api.get("/municipios").then((r) => setMunicipios(r.data || [])).catch(() => {});
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setModal("create");
  };

  const openEdit = (n) => {
    setForm({
      titulo: n.titulo,
      mensagem: n.mensagem,
      tipo: n.tipo,
      destino: n.municipio_ids ? "especificos" : "todos",
      municipio_ids: n.municipio_ids || [],
      expira_em: n.expira_em ? n.expira_em.slice(0, 10) : "",
    });
    setEditId(n.id);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.mensagem.trim()) return;
    setActing(true);
    try {
      const payload = {
        titulo: form.titulo,
        mensagem: form.mensagem,
        tipo: form.tipo,
        municipio_ids: form.destino === "especificos" ? form.municipio_ids : null,
        expira_em: form.expira_em || null,
      };
      if (modal === "edit") {
        await api.patch(`/notificacoes/${editId}`, payload);
      } else {
        await api.post("/notificacoes", payload);
      }
      await fetchNotifs();
      closeModal();
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async (id) => {
    setActing(true);
    try {
      await api.delete(`/notificacoes/${id}`);
      setNotifs((prev) => prev.filter((n) => n.id !== id));
      setDeleteId(null);
    } finally {
      setActing(false);
    }
  };

  const toggleMunicipio = (id) => {
    setForm((prev) => ({
      ...prev,
      municipio_ids: prev.municipio_ids.includes(id)
        ? prev.municipio_ids.filter((m) => m !== id)
        : [...prev.municipio_ids, id],
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
            Notificações
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Crie e gerencie notificações para os usuários da plataforma.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nova Notificação
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm animate-pulse">
            Carregando...
          </div>
        ) : notifs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
            Nenhuma notificação criada.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Título
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Destino
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Criado em
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Expira em
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {notifs.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-800 dark:text-white max-w-xs">
                    <div className="truncate">{n.titulo}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{n.mensagem}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_STYLES[n.tipo] || TIPO_STYLES.info}`}>
                      {TIPO_OPTIONS.find((t) => t.value === n.tipo)?.label || n.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                    {n.municipio_ids ? `${n.municipio_ids.length} municípios` : "Todos"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                    {fmtDate(n.criado_em)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                    {fmtDate(n.expira_em)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(n)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(n.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100 dark:border-slate-800"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-bold text-slate-800 dark:text-white">
                  {modal === "edit" ? "Editar Notificação" : "Nova Notificação"}
                </h2>
                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                    maxLength={100}
                    required
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Título da notificação"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem
                  </label>
                  <textarea
                    value={form.mensagem}
                    onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
                    required
                    rows={3}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Conteúdo da notificação"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Tipo
                    </label>
                    <select
                      value={form.tipo}
                      onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIPO_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Expira em (opcional)
                    </label>
                    <input
                      type="date"
                      value={form.expira_em}
                      onChange={(e) => setForm((f) => ({ ...f, expira_em: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Destino
                  </label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="todos"
                        checked={form.destino === "todos"}
                        onChange={() => setForm((f) => ({ ...f, destino: "todos", municipio_ids: [] }))}
                      />
                      <span className="text-slate-700 dark:text-slate-300">Todos os municípios</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="especificos"
                        checked={form.destino === "especificos"}
                        onChange={() => setForm((f) => ({ ...f, destino: "especificos" }))}
                      />
                      <span className="text-slate-700 dark:text-slate-300">Municípios específicos</span>
                    </label>
                  </div>
                </div>

                {form.destino === "especificos" && municipios.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                    {municipios.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={form.municipio_ids.includes(m.id)}
                          onChange={() => toggleMunicipio(m.id)}
                        />
                        <span className="text-slate-700 dark:text-slate-300">{m.nome}</span>
                        <span className="text-xs text-slate-400">{m.estado}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={acting}
                    className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {acting ? "Salvando..." : modal === "edit" ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 dark:border-slate-800 p-6 text-center"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <p className="font-semibold text-slate-800 dark:text-white mb-2">Excluir notificação?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={acting}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {acting ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
