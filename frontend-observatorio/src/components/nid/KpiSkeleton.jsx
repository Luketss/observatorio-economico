import ChartState from "./ChartState";

// KpiSkeleton — card de KPI em loading, padrão único do app (UX/UI C4).
export default function KpiSkeleton({ height = 80 }) {
  return (
    <div className="nid-kpi">
      <ChartState kind="loading" shape="kpi" height={height} />
    </div>
  );
}
