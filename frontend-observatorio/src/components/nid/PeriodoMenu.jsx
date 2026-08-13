import { PRESETS_PAINEL } from "../../utils/periodoGrafico";

/**
 * Seletor compacto de período POR GRÁFICO (slot `right` do NidPanel).
 * Nenhuma pill acesa = o gráfico segue o filtro da página; clicar na pill
 * ativa desliga o override. Reusa o visual dos tabs do painel (.nid-tab).
 */
export default function PeriodoMenu({ value, onChange }) {
  return (
    <div className="nid-panel-actions" role="group" aria-label="Período deste gráfico">
      {PRESETS_PAINEL.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`nid-tab ${value === p.key ? "active" : ""}`}
          aria-pressed={value === p.key}
          title={value === p.key ? "Voltar a seguir o filtro da página" : `Mostrar ${p.label} neste gráfico`}
          onClick={() => onChange(value === p.key ? null : p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
