import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../services/api";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  StarIcon,
  UserGroupIcon,
  HomeIcon,
  HeartIcon,
  AcademicCapIcon,
  TruckIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  BoltIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

const ICONS = [
  { key: "StarIcon", label: "Estrela", Icon: StarIcon },
  { key: "UserGroupIcon", label: "Pessoas", Icon: UserGroupIcon },
  { key: "HomeIcon", label: "Habitação", Icon: HomeIcon },
  { key: "HeartIcon", label: "Saúde", Icon: HeartIcon },
  { key: "AcademicCapIcon", label: "Educação", Icon: AcademicCapIcon },
  { key: "TruckIcon", label: "Infraestrutura", Icon: TruckIcon },
  { key: "ChartBarIcon", label: "Indicador", Icon: ChartBarIcon },
  { key: "BuildingOfficeIcon", label: "Instituição", Icon: BuildingOfficeIcon },
  { key: "BoltIcon", label: "Energia", Icon: BoltIcon },
  { key: "GlobeAltIcon", label: "Geral", Icon: GlobeAltIcon },
];

const COLORS = [
  { key: "blue", label: "Azul", cls: "bg-blue-500" },
  { key: "green", label: "Verde", cls: "bg-green-500" },
  { key: "purple", label: "Roxo", cls: "bg-purple-500" },
  { key: "orange", label: "Laranja", cls: "bg-orange-500" },
  { key: "red", label: "Vermelho", cls: "bg-red-500" },
  { key: "slate", label: "Cinza", cls: "bg-slate-500" },
];

const EMPTY_FORM = { titulo: "", valor: "", subtitulo: "", icone: "StarIcon", cor: "blue", ordem: 0 };

const ICON_MAP = Object.fromEntries(ICONS.map((i) => [i.key, i.Icon]));

export default function CustomCardsAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/municipios").then((r) => setMunicipios(r.data || []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api
      .get("/dashboard-cards", { params: { municipio_id: selectedId } })
      .then((r) => setCards(r.data || []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (card) => {
    setEditing(card);
    setForm({
      titulo: card.titulo,
      valor: card.valor,
      subtitulo: card.subtitulo || "",
      icone: card.icone,
      cor: card.cor,
      ordem: card.ordem,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const res = await api.put(`/dashboard-cards/${editing.id}`, form);
        setCards((prev) => prev.map((c) => (c.id === editing.id ? res.data : c)));
      } else {
        const res = await api.post("/dashboard-cards", {
          ...form,
          municipio_id: parseInt(selectedId),
        });
        setCards((prev) => [...prev, res.data]);
      }
      setShowForm(false);
    } catch (err) {
      alert(err.response?.data?.detail || "Erro ao salvar card.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este card?")) return;
    try {
      await api.delete(`/dashboard-cards/${id}`);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert("Erro ao excluir card.");
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
          Cards Customizados
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Adicione indicadores personalizados ao Dashboard Geral de cada município.
        </p>
      </div>

      {/* Municipality selector */}
      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-6">
        <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2">
          Município
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-sm border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm   focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Selecione um município...</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.estado}
            </option>
          ))}
        </select>
      </div>

      {/* Cards list */}
      {selectedId && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-3 py-4 md:px-6 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--text)]">Cards</h3>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Novo Card
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 bg-[var(--panel-2)] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-[var(--text-mute)] text-sm">
                Nenhum card criado. Clique em "Novo Card" para começar.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50  text-left text-xs uppercase text-[var(--text-mute)] tracking-wider">
                  <th className="px-3 py-3 md:px-6">Ícone</th>
                  <th className="px-3 py-3 md:px-6">Título</th>
                  <th className="px-3 py-3 md:px-6">Valor</th>
                  <th className="px-3 py-3 md:px-6">Subtítulo</th>
                  <th className="px-3 py-3 md:px-6">Ordem</th>
                  <th className="px-3 py-3 md:px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {cards.map((card) => {
                  const Icon = ICON_MAP[card.icone] || StarIcon;
                  const color = COLORS.find((c) => c.key === card.cor);
                  return (
                    <tr key={card.id} className="hover:bg-[var(--panel-2)] transition-colors">
                      <td className="px-3 py-4 md:px-6">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color?.cls || "bg-blue-500"}`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                      </td>
                      <td className="px-3 py-4 md:px-6 font-medium text-[var(--text)]">{card.titulo}</td>
                      <td className="px-3 py-4 md:px-6 text-[var(--text-dim)]">{card.valor}</td>
                      <td className="px-3 py-4 md:px-6 text-[var(--text-mute)]">{card.subtitulo || "—"}</td>
                      <td className="px-3 py-4 md:px-6 text-[var(--text-mute)]">{card.ordem}</td>
                      <td className="px-3 py-4 md:px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(card)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] rounded-lg transition-colors"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(card.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-[var(--panel-2)] rounded-lg transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal form */}
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
              className="bg-[var(--panel)] rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[var(--text)]">
                  {editing ? "Editar Card" : "Novo Card"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 ">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Título *</label>
                  <input
                    required
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ex: População"
                    className="w-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Valor *</label>
                  <input
                    required
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    placeholder="Ex: 112.000 hab."
                    className="w-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Subtítulo</label>
                  <input
                    value={form.subtitulo}
                    onChange={(e) => setForm({ ...form, subtitulo: e.target.value })}
                    placeholder="Ex: Censo 2022"
                    className="w-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Ícone</label>
                  <div className="grid grid-cols-5 gap-2">
                    {ICONS.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => setForm({ ...form, icone: key })}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                          form.icone === key
                            ? "border-violet-500 bg-violet-50 "
                            : "border-[var(--border)] hover:border-slate-300"
                        }`}
                      >
                        <Icon className="w-5 h-5 text-[var(--text-dim)]" />
                        <span className="text-[10px] text-[var(--text-dim)] text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Cor</label>
                  <div className="flex gap-2">
                    {COLORS.map(({ key, label, cls }) => (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => setForm({ ...form, cor: key })}
                        className={`w-8 h-8 rounded-full ${cls} transition-transform ${
                          form.cor === key ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">Ordem</label>
                  <input
                    type="number"
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })}
                    className="w-24 border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 border border-[var(--border)] text-[var(--text-dim)] text-sm font-medium py-2.5 rounded-xl hover:bg-[var(--panel-2)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
