// Lógica pura das prioridades do mês: prefixo de tipo no título, validação
// do editor e mapas de dataset (compartilhados por PrioridadesPanel e
// PrioridadesEditorModal).

export const TIPOS_PRIORIDADE = ["Atenção", "Oportunidade", "Risco"];

export const DATASET_ROUTE = {
  caged: "/app/caged",
  pib: "/app/pib",
  arrecadacao: "/app/arrecadacao",
  rais: "/app/rais",
  bolsa_familia: "/app/bolsa-familia",
  pe_de_meia: "/app/pe-de-meia",
  inss: "/app/inss",
  estban: "/app/estban",
  comex: "/app/comex",
  empresas: "/app/empresas",
  pix: "/app/pix",
};

export const DATASET_LABEL = {
  caged: "CAGED",
  pib: "PIB",
  arrecadacao: "Arrecadação",
  rais: "RAIS",
  bolsa_familia: "Bolsa Família",
  pe_de_meia: "Pé-de-Meia",
  inss: "INSS",
  estban: "Bancos",
  comex: "Comércio Exterior",
  empresas: "Empresas",
  pix: "PIX",
};

const PREFIXO_RE = /^(Atenção|Oportunidade|Risco):\s*/;

export function parseTitulo(titulo) {
  const match = PREFIXO_RE.exec(titulo || "");
  if (!match) return { tipo: null, texto: titulo || "" };
  return { tipo: match[1], texto: (titulo || "").slice(match[0].length) };
}

export function montarTitulo(tipo, texto) {
  const t = (texto || "").trim();
  if (!tipo) return t;
  return `${tipo}: ${t}`;
}

export function validarItens(itens) {
  if (!itens || itens.length === 0) return "Inclua ao menos uma prioridade.";
  if (itens.length > 3) return "Máximo de 3 prioridades.";
  for (const item of itens) {
    if (!(item.texto || "").trim()) return "Título é obrigatório em todas as prioridades.";
    if (!(item.observacao || "").trim()) return "Observação é obrigatória em todas as prioridades.";
  }
  return null;
}
