import { createContext, useContext, useState, useMemo } from "react";

/**
 * ChartHoverContext — cross-chart hover synchronisation (ticket 14)
 *
 * Usage:
 *   <ChartHoverProvider>
 *     <AreaLineChart  data={...} syncGroup="annual" />
 *     <MultiLineChart data={...} syncGroup="annual" />
 *     <TwinBarChart   data={...} syncGroup="annual" />
 *   </ChartHoverProvider>
 *
 * Charts without syncGroup, or rendered outside a provider, are completely
 * unaffected — the default context is a no-op.
 *
 * Sem consumidor em páginas desde set/2026: o Núcleo de Dados deixou de
 * sincronizar Evolução do PIB ↔ PIB Comparativo (o cliente reportou o hover
 * espelhado como bug). Religar só por decisão de produto.
 */

const Ctx = createContext({ get: () => undefined, set: () => {} });

export function ChartHoverProvider({ children }) {
  const [state, setState] = useState({}); // { [group]: hoveredLabel | null }

  const api = useMemo(
    () => ({
      get: (group) => state[group],
      set: (group, label) =>
        setState((s) => {
          // Avoid unnecessary re-renders when value hasn't changed
          if (s[group] === label) return s;
          return { ...s, [group]: label };
        }),
    }),
    [state]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * useChartHover(group)
 *
 * Returns [externalLabel, setExternalLabel].
 * When group is falsy (syncGroup not provided) returns [null, noop] so charts
 * don't need to guard the call-site.
 */
export function useChartHover(group) {
  const ctx = useContext(Ctx);
  if (!group) return [null, () => {}];
  return [ctx.get(group) ?? null, (label) => ctx.set(group, label)];
}
