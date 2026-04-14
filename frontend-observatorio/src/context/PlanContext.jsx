import { createContext, useContext } from "react";

export const PlanContext = createContext({
  modulos: null,
  canAccess: () => true,
});

export function usePlan() {
  return useContext(PlanContext);
}
