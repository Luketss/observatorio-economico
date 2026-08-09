/**
 * Monta as séries do comparativo por pares a partir do envelope do backend
 * (`{ foco, pares, fixados, criterio_pares, motivo, itens }`).
 *
 * Duas regras carregam peso aqui:
 *  - o domínio de anos é o do FOCO — ano que o foco não tem não vira coluna,
 *    senão a linha em destaque abriria buracos por causa de um par;
 *  - município sem dado num ano fica AUSENTE da linha, nunca 0. O gráfico
 *    desenha buraco; zero desenharia um tombo que não aconteceu.
 */

const MOTIVOS = {
  sem_municipio: "selecione um município",
  sem_populacao: "sem população cadastrada, não há como escolher pares",
  sem_pares: "nenhum município par encontrado",
};

// Homônimos entre UFs (Bom Jesus/PI e Bom Jesus/RS) colidiriam no pivot por nome.
function rotular(refs) {
  const contagem = new Map();
  refs.forEach((r) => contagem.set(r.nome, (contagem.get(r.nome) || 0) + 1));
  return new Map(
    refs.map((r) => [r.municipio_id, contagem.get(r.nome) > 1 ? `${r.nome} (${r.estado})` : r.nome])
  );
}

export function montarComparativo({ itens, foco, pares, fixados, anoKey, valorKey }) {
  const vazio = { data: [], focusSeries: null, peerSeries: [], pinnedSeries: [] };
  if (!foco) return vazio;

  const refs = [foco, ...(pares || []), ...(fixados || [])];
  const nomeDe = rotular(refs);
  const linhas = itens || [];

  const anosFoco = [
    ...new Set(linhas.filter((i) => i.municipio_id === foco.municipio_id).map((i) => i[anoKey])),
  ].sort((a, b) => a - b);

  const porAno = new Map(anosFoco.map((ano) => [ano, { label: String(ano) }]));
  linhas.forEach((i) => {
    const linha = porAno.get(i[anoKey]);
    const nome = nomeDe.get(i.municipio_id);
    if (!linha || !nome) return;
    const v = i[valorKey];
    if (v == null) return;
    linha[nome] = v;
  });

  return {
    data: [...porAno.values()],
    focusSeries: nomeDe.get(foco.municipio_id),
    peerSeries: (pares || []).map((p) => nomeDe.get(p.municipio_id)),
    pinnedSeries: (fixados || []).map((f) => nomeDe.get(f.municipio_id)),
  };
}

/** Subtítulo do painel: diz quem é o foco, quantos pares e por qual critério —
 *  ou, quando não há pares, o motivo. Painel nenhum fica mudo. */
export function descreverPares({ foco, pares, criterio_pares, motivo }) {
  if (!foco) return MOTIVOS[motivo] || MOTIVOS.sem_municipio;
  const n = (pares || []).length;
  if (!n) return `${foco.nome} · ${MOTIVOS[motivo] || MOTIVOS.sem_pares}`;
  const plural = n === 1 ? "par" : "pares";
  return criterio_pares
    ? `${foco.nome} vs. ${n} ${plural} · ${criterio_pares}`
    : `${foco.nome} vs. ${n} ${plural}`;
}
