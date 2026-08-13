// Lógica pura da tela /admin/indicadores — merge catálogo × banco e filtro.
// Extraída da página para teste unitário (padrão jobStatus.js).

const temConteudo = (r) =>
  Boolean((r.tooltip || "").trim() || (r.descricao || "").trim());

export function mesclarCatalogoComBanco(catalog, rows) {
  const porChave = new Map(
    (rows || []).map((r) => [`${r.dataset} ${r.indicador_key}`, r])
  );
  const usadas = new Set();
  const grupos = Object.entries(catalog).map(([dataset, entries]) => ({
    dataset,
    entries: entries.map((e) => {
      const id = `${dataset} ${e.key}`;
      const row = porChave.get(id);
      if (row) usadas.add(id);
      return {
        key: e.key,
        label: e.label,
        tipo: e.tipo,
        preenchido: row ? temConteudo(row) : false,
        tooltip: row?.tooltip || "",
        descricao: row?.descricao || "",
        fonte: row?.fonte || "",
      };
    }),
  }));
  const orfaos = (rows || []).filter(
    (r) => !usadas.has(`${r.dataset} ${r.indicador_key}`)
  );
  return { grupos, orfaos };
}

export function filtrarGrupos(grupos, { busca, soVazios }) {
  const q = (busca || "").trim().toLowerCase();
  return grupos
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => {
        if (soVazios && e.preenchido) return false;
        if (!q) return true;
        return (
          e.label.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          e.tooltip.toLowerCase().includes(q) ||
          e.descricao.toLowerCase().includes(q) ||
          g.dataset.toLowerCase().includes(q)
        );
      }),
    }))
    .filter((g) => g.entries.length > 0);
}
