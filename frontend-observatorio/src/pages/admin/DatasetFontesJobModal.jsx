import NidModal from "../../components/nid/NidModal";
import StatusChip from "../../components/nid/StatusChip";
import {
  DATASET_TODAS, duracaoJob, labelDataset, linhasJob,
} from "../../utils/jobStatus";

// item do resumo por fonte ({status: "ok"|"aviso"|"erro"}) → shape de job
// que o chipDoJob entende (ok→concluído limpo, aviso→concluído c/ avisos)
const jobDaFonte = (f) =>
  f.status === "erro"
    ? { status: "erro" }
    : { status: "concluido", resumo: f.status === "aviso" ? { erros: ["aviso"] } : {} };

function Filtros({ filtros }) {
  if (!filtros) return <span style={{ color: "var(--text-mute)" }}>—</span>;
  const partes = [];
  if (filtros.municipio_ids?.length) partes.push(`${filtros.municipio_ids.length} município(s)`);
  else if (filtros.estado) partes.push(`UF ${filtros.estado}`);
  else partes.push("Brasil inteiro");
  if (filtros.anos?.length) partes.push(`anos ${filtros.anos.join(", ")}`);
  partes.push(filtros.notificar ? "com notificações" : "sem notificações");
  return <>{partes.join(" · ")}</>;
}

/** Detalhes completos de um job de ingestão: erro sem truncar, filtros,
 * duração e — no meta-job "todas" — o resultado por fonte. */
export default function DatasetFontesJobModal({ job, onClose }) {
  return (
    <NidModal
      open={Boolean(job)}
      onClose={onClose}
      eyebrow="Histórico de coletas"
      title={job ? `${labelDataset(job.dataset)} — job ${job.id}` : ""}
      size="lg"
    >
      {job && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusChip job={job} />
            <span style={{ color: "var(--text-dim)" }}>
              {new Date(job.criado_em).toLocaleString("pt-BR")} · {duracaoJob(job)}
              {linhasJob(job) != null && ` · ${new Intl.NumberFormat("pt-BR").format(linhasJob(job))} linha(s)`}
            </span>
          </div>

          <p style={{ color: "var(--text-dim)" }}>
            <b style={{ color: "var(--text)" }}>Filtros:</b> <Filtros filtros={job.filtros} />
          </p>

          {job.erro && (
            <div
              className="rounded-lg p-3 text-xs whitespace-pre-wrap break-words"
              style={{
                background: "color-mix(in oklab, var(--accent-2) 8%, transparent)",
                border: "1px solid color-mix(in oklab, var(--accent-2) 30%, transparent)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {job.erro}
            </div>
          )}

          {job.dataset === DATASET_TODAS && job.resumo?.fontes && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-dim)" }}>
                  <th className="py-1.5 pr-3">Fonte</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Linhas</th>
                  <th className="py-1.5">Erros/avisos</th>
                </tr>
              </thead>
              <tbody>
                {job.resumo.fontes.map((f) => (
                  <tr key={f.key} className="align-top" style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: "var(--text)" }}>{f.key}</td>
                    <td className="py-1.5 pr-3">
                      <StatusChip job={jobDaFonte(f)} />
                    </td>
                    <td className="py-1.5 pr-3" style={{ color: "var(--text-dim)" }}>{f.linhas ?? 0}</td>
                    <td className="py-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-dim)" }}>
                      {(f.erros || []).join("; ") || f.erro || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {job.dataset !== DATASET_TODAS && job.resumo?.erros?.length > 0 && (
            <div>
              <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                Avisos ({job.resumo.erros.length})
              </p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
                {job.resumo.erros.map((e, i) => (
                  <li key={i} className="whitespace-pre-wrap break-words">• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </NidModal>
  );
}
