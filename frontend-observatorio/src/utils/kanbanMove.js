// Movimento otimista dos kanbans: novo array com o item movido, ou o array
// original (mesma referência) quando o movimento é um no-op — o caller usa
// a identidade para pular request/re-render.
export function aplicarMovimento(items, id, campo, valor) {
  const item = items.find((i) => i.id === id);
  if (!item || item[campo] === valor) return items;
  return items.map((i) => (i.id === id ? { ...i, [campo]: valor } : i));
}
