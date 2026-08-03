// Parser puro do markdown leve dos conteúdos de projeto.
// Gramática: "## "/"### " títulos, "- " itens de lista (consecutivos agrupam),
// linha em branco separa parágrafos, quebra simples vira nova linha do mesmo
// parágrafo, **negrito** em qualquer bloco. Sem HTML, links ou imagens —
// o que não casar com a gramática é texto literal.

export function parseInline(texto) {
  const segmentos = [];
  const re = /\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) segmentos.push({ negrito: false, texto: texto.slice(ultimo, m.index) });
    segmentos.push({ negrito: true, texto: m[1] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) segmentos.push({ negrito: false, texto: texto.slice(ultimo) });
  if (segmentos.length === 0) segmentos.push({ negrito: false, texto: "" });
  return segmentos;
}

export function parseMarkdownLite(texto) {
  const blocos = [];
  if (!texto) return blocos;

  let paragrafo = null;
  let lista = null;
  const fechaParagrafo = () => { if (paragrafo) { blocos.push(paragrafo); paragrafo = null; } };
  const fechaLista = () => { if (lista) { blocos.push(lista); lista = null; } };

  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (t === "") { fechaParagrafo(); fechaLista(); continue; }
    if (t.startsWith("### ")) { fechaParagrafo(); fechaLista(); blocos.push({ tipo: "h3", inline: parseInline(t.slice(4)) }); continue; }
    if (t.startsWith("## ")) { fechaParagrafo(); fechaLista(); blocos.push({ tipo: "h2", inline: parseInline(t.slice(3)) }); continue; }
    if (t.startsWith("- ")) {
      fechaParagrafo();
      if (!lista) lista = { tipo: "lista", itens: [] };
      lista.itens.push(parseInline(t.slice(2)));
      continue;
    }
    fechaLista();
    if (!paragrafo) paragrafo = { tipo: "paragrafo", linhas: [] };
    paragrafo.linhas.push(parseInline(t));
  }
  fechaParagrafo();
  fechaLista();
  return blocos;
}
