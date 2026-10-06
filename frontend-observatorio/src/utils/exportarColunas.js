// Monta { colunas, linhas } a partir do `data` que cada grafico de charts.jsx
// ja recebe, com os mesmos valores dos tooltips e sem formatacao de moeda.
// Puro: sem React, sem DOM. Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md

export const COLUNA_PERIODO = { chave: "periodo", rotulo: "Periodo", tipo: "texto" };

const numero = (chave, rotulo) => ({ chave, rotulo, tipo: "numero" });
const lista = (data) => (Array.isArray(data) ? data : []);
const ouNull = (v) => (v == null ? null : v);

export function exportacaoArea(data, label = "Valor") {
  return {
    colunas: [COLUNA_PERIODO, numero("valor", label)],
    linhas: lista(data).map((d) => ({ periodo: d.label, valor: ouNull(d.value) })),
  };
}

export function exportacaoEmpilhado(data, keys = [], comTotal = false) {
  const colunas = [COLUNA_PERIODO, ...keys.map((k) => numero(k, k))];
  if (comTotal) colunas.push(numero("total", "Total"));
  const linhas = lista(data).map((d) => {
    const linha = { periodo: d.label };
    let total = 0;
    keys.forEach((k) => {
      linha[k] = ouNull(d[k]);
      if (typeof d[k] === "number") total += d[k];
    });
    if (comTotal) linha.total = total;
    return linha;
  });
  return { colunas, linhas };
}

export function exportacaoMultiLinha(data, series = []) {
  return {
    colunas: [COLUNA_PERIODO, ...series.map((s) => numero(s, s))],
    linhas: lista(data).map((d) => {
      const linha = { periodo: d.label };
      series.forEach((s) => { linha[s] = ouNull(d[s]); });
      return linha;
    }),
  };
}

export function exportacaoTwin(data, { acumulado = false } = {}) {
  const colunas = [
    COLUNA_PERIODO,
    numero("admissoes", "Admissoes"),
    numero("desligamentos", "Desligamentos"),
    numero("saldo", "Saldo"),
  ];
  if (acumulado) colunas.push(numero("acumulado", "Saldo acumulado"));
  let soma = 0;
  const linhas = lista(data).map((d) => {
    const adm = Number(d.admissoes) || 0;
    const des = Number(d.desligamentos) || 0;
    const saldo = adm - des;
    soma += saldo;
    const linha = { periodo: d.label, admissoes: adm, desligamentos: des, saldo };
    if (acumulado) linha.acumulado = soma;
    return linha;
  });
  return { colunas, linhas };
}

export function exportacaoDonut(data) {
  const itens = lista(data);
  const total = itens.reduce((s, d) => s + (Number(d.value) || 0), 0);
  return {
    colunas: [
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      numero("valor", "Valor"),
      numero("participacao", "Participacao (%)"),
    ],
    linhas: itens.map((d) => ({
      categoria: d.label != null ? d.label : d.name,
      valor: ouNull(d.value),
      participacao: total ? Math.round(((Number(d.value) || 0) / total) * 10000) / 100 : null,
    })),
  };
}

export function exportacaoRanking(data, { comPosicao = false, offset = 0 } = {}) {
  const colunas = [
    ...(comPosicao ? [numero("posicao", "Posicao")] : []),
    { chave: "nome", rotulo: "Nome", tipo: "texto" },
    numero("valor", "Valor"),
  ];
  const linhas = lista(data).map((d, i) => {
    const linha = { nome: d.label, valor: ouNull(d.value) };
    if (comPosicao) linha.posicao = i + 1 + offset;
    return linha;
  });
  return { colunas, linhas };
}
