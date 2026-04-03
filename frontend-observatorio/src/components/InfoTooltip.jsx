import { useEffect, useRef, useState } from "react";
import { InformationCircleIcon, PencilIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function InfoTooltip({ dataset }) {
  const { user } = useAuth();
  const isGlobal = user?.role === "ADMIN_GLOBAL";

  const [info, setInfo] = useState(null); // { titulo, conteudo }
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ titulo: "", conteudo: "" });
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api
      .get("/dataset-info", { params: { dataset } })
      .then((r) => {
        setInfo(r.data);
        setForm({ titulo: r.data.titulo, conteudo: r.data.conteudo });
      })
      .catch(() => {});
  }, [dataset]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/dataset-info/${dataset}`, form);
      setInfo(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // Don't render anything if no text and not admin
  if (!isGlobal && (!info?.conteudo)) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); setEditing(false); }}
        className={`p-1 rounded-lg transition-colors ${
          info?.conteudo
            ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            : "text-slate-300 dark:text-slate-600 hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
        title="Informações sobre este dado"
      >
        <InformationCircleIcon className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Título</label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex: O que é o CAGED?"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Conteúdo</label>
                <textarea
                  rows={4}
                  value={form.conteudo}
                  onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                  placeholder="Explique o que este dado representa, como interpretar os valores, fontes, etc."
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  {saving ? "Salvando..." : "Salvar"}
                </button>
                <button
                  onClick={() => { setEditing(false); setForm({ titulo: info?.titulo || "", conteudo: info?.conteudo || "" }); }}
                  className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {info?.titulo || "Informação sobre este dado"}
                </p>
                {isGlobal && (
                  <button
                    onClick={() => setEditing(true)}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors flex-shrink-0"
                    title="Editar"
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {info?.conteudo ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {info.conteudo}
                </p>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                  Nenhuma informação configurada. Clique no lápis para adicionar.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
