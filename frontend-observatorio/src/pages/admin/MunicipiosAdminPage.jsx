import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { PhotoIcon } from "@heroicons/react/24/outline";

export default function MunicipiosAdminPage() {
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // { [id]: bool }
  const fileRefs = useRef({});

  const load = () => {
    setLoading(true);
    api
      .get("/municipios/")
      .then((r) => setMunicipios(r.data || []))
      .catch(() => setMunicipios([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const togglePlano = async (municipio) => {
    const novoPlano = municipio.plano === "free" ? "paid" : "free";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">
          Municípios
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Gerencie planos, brasões e configurações de cada município.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : municipios.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
            Nenhum município cadastrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                <th className="px-6 py-3">Brasão</th>
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">IBGE</th>
                <th className="px-6 py-3">Plano</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {municipios.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {/* Brasão */}
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      {m.brasao ? (
                        <img
                          src={m.brasao}
                          alt="Brasão"
                          className="w-10 h-10 object-contain rounded border border-slate-100 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <PhotoIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Nome */}
                  <td className="px-6 py-3 font-medium text-slate-800 dark:text-white">{m.nome}</td>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{m.estado}</td>
                  <td className="px-6 py-3 text-slate-400 dark:text-slate-500">{m.codigo_ibge || "—"}</td>

                  {/* Plano */}
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        m.plano === "paid"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {m.plano === "paid" ? "Pago" : "Gratuito"}
                    </span>
                  </td>

                  {/* Ações */}
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Toggle plano */}
                      <button
                        onClick={() => togglePlano(m)}
                        disabled={saving[m.id]}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                      >
                        {saving[m.id] ? "..." : m.plano === "paid" ? "→ Gratuito" : "→ Pago"}
                      </button>

                      {/* Upload brasão */}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={(el) => (fileRefs.current[m.id] = el)}
                        onChange={(e) => handleBrasaoChange(m, e.target.files?.[0])}
                      />
                      <button
                        onClick={() => fileRefs.current[m.id]?.click()}
                        disabled={saving[`brasao_${m.id}`]}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 hover:bg-violet-100 transition-colors disabled:opacity-40"
                      >
                        {saving[`brasao_${m.id}`] ? "Salvando..." : m.brasao ? "Alterar Brasão" : "Adicionar Brasão"}
                      </button>

                      {m.brasao && (
                        <button
                          onClick={() => removeBrasao(m)}
                          disabled={saving[`brasao_${m.id}`]}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
                        >
                          Remover
                        </button>
                      )}
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
