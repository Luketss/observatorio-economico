import { useMemo } from "react";
import { useFilterStore } from "../../app/store/filterStore";
import Button from "../ui/Button";
import empresasData from "../../data/empresas_multicidades.json";

export default function FilterBar() {
  const {
    ano,
    mes,
    cidade,
    setor,
    setAno,
    setMes,
    setCidade,
    setSetor,
    reset,
  } = useFilterStore();

  // 🔎 Gerar opções dinâmicas a partir do dataset real
  const cidades = useMemo(
    () => ["Todos", ...Array.from(new Set(empresasData.map((d) => d.cidade)))],
    []
  );

  const anos = useMemo(
    () =>
      ["Todos", ...Array.from(new Set(empresasData.map((d) => d.ano))).sort()],
    []
  );

  const setores = useMemo(
    () => ["Todos", ...Array.from(new Set(empresasData.map((d) => d.setor)))],
    []
  );

  const meses = ["Todos", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-4 items-center justify-between">
      <div className="flex flex-wrap gap-4 w-full">

        {/* Cidade */}
        <select
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {cidades.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        {/* Ano */}
        <select
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Mês */}
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Setor */}
        <select
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {setores.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <Button variant="ghost" onClick={reset}>
        Limpar Filtros
      </Button>
    </div>
  );
}
