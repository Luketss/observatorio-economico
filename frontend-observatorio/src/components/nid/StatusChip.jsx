import { chipDoJob } from "../../utils/jobStatus";

/** Chip de status de job de ingestão (cores via tokens .nid-pill--*). */
export default function StatusChip({ job }) {
  if (!job) return null;
  const { label, pill } = chipDoJob(job);
  return (
    <span className={`nid-pill ${pill}`}>
      {job.status === "executando" && <span className="nid-pill__dot" aria-hidden="true" />}
      {label}
    </span>
  );
}
