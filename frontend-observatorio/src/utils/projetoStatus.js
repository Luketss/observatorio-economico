// Regras de atraso e progresso do acompanhamento de projetos.
// Datas "YYYY-MM-DD" comparadas em data local (mesmo tratamento do fmtDate
// das páginas: new Date(d + "T00:00:00")).

const DIA_MS = 24 * 60 * 60 * 1000;

function dataLocal(iso) {
  return new Date(iso + "T00:00:00");
}

function hojeZerado(hoje) {
  const d = hoje ? new Date(hoje) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diasAtraso(projeto, hoje) {
  if (!projeto?.data_prazo || projeto.status === "concluido") return null;
  const diff = Math.round((hojeZerado(hoje) - dataLocal(projeto.data_prazo)) / DIA_MS);
  return diff >= 1 ? diff : null;
}

export function tarefaAtrasada(tarefa, hoje) {
  if (!tarefa?.prazo || tarefa.concluida) return false;
  return dataLocal(tarefa.prazo) < hojeZerado(hoje);
}

export function progresso(tarefas) {
  if (!tarefas || tarefas.length === 0) return null;
  const feitas = tarefas.filter((t) => t.concluida).length;
  return {
    feitas,
    total: tarefas.length,
    pct: Math.round((feitas / tarefas.length) * 100),
  };
}
