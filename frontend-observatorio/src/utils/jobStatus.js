// Helpers puros de status/resumo dos jobs de ingestão (tela de coletas).
// Extraídos de DatasetFontesAdminPage para teste unitário.

export const DATASET_TODAS = "todas";

const LABELS = {
  pendente: "Na fila",
  executando: "Executando",
  concluido: "Concluído",
  erro: "Erro",
  abortado: "Abortado",
};

const PILLS = {
  pendente: "nid-pill--warn",
  executando: "nid-pill--run",
  concluido: "nid-pill--ok",
  erro: "nid-pill--err",
  abortado: "nid-pill--err",
};

export function labelStatus(status) {
  return LABELS[status] || status;
}

export const labelDataset = (key) =>
  key === DATASET_TODAS ? "Todas as fontes" : key;

export function resumoTodas(resumo) {
  const fontes = resumo?.fontes || [];
  const comErro = fontes.filter((f) => f.status === "erro");
  const comAviso = fontes.filter((f) => f.status === "aviso");
  return {
    fontes,
    ok: fontes.length - comErro.length - comAviso.length,
    aviso: comAviso.length,
    erro: comErro.length,
    keysErro: comErro.map((f) => f.key),
    linhas: fontes.reduce((s, f) => s + (f.linhas || 0), 0),
  };
}

export function textoResumoTodas({ ok, aviso, erro, keysErro }) {
  const partes = [];
  if (ok) partes.push(`${ok} ok`);
  if (aviso) partes.push(`${aviso} com aviso`);
  if (erro) partes.push(`${erro} com erro (${keysErro.slice(0, 3).join(", ")})`);
  return partes.join(", ") || "0 fontes";
}

function temAvisos(job) {
  const r = job.resumo;
  if (!r) return false;
  if (job.dataset === DATASET_TODAS) {
    const agg = resumoTodas(r);
    return agg.erro > 0 || agg.aviso > 0;
  }
  return (r.erros?.length || 0) > 0 || (r.municipios_erro || 0) > 0;
}

/** Chip de status: "concluído" com erros parciais vira aviso (âmbar). */
export function chipDoJob(job) {
  if (job.status === "concluido" && temAvisos(job)) {
    return { label: "Concluído c/ avisos", pill: "nid-pill--warn" };
  }
  return { label: labelStatus(job.status), pill: PILLS[job.status] || "" };
}

export function duracaoJob(job) {
  if (!job?.iniciado_em || !job?.finalizado_em) return "—";
  const s = Math.round((new Date(job.finalizado_em) - new Date(job.iniciado_em)) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}`;
}

export function linhasJob(job) {
  if (job.dataset === DATASET_TODAS) {
    return job.resumo?.fontes ? resumoTodas(job.resumo).linhas : null;
  }
  return job.resumo?.linhas ?? null;
}

/** Ano no padrão de nome do arquivo do IPS Brasil ("ips_brasil_municipios_2025.xlsx"). */
export function anoDoNomeArquivo(nome) {
  const m = /ips_brasil_municipios[_-](\d{4})/i.exec(nome || "");
  return m ? m[1] : "";
}
