import { create } from "zustand";

interface FilterState {
  ano: string;
  mes: string;
  cidade: string;
  setor: string;
  setAno: (ano: string) => void;
  setMes: (mes: string) => void;
  setCidade: (cidade: string) => void;
  setSetor: (setor: string) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  ano: localStorage.getItem("ano") || "Todos",
  mes: localStorage.getItem("mes") || "Todos",
  cidade: localStorage.getItem("cidade") || "Todos",
  setor: localStorage.getItem("setor") || "Todos",

  setAno: (ano) =>
    set(() => {
      localStorage.setItem("ano", ano);
      return { ano };
    }),
  setMes: (mes) =>
    set(() => {
      localStorage.setItem("mes", mes);
      return { mes };
    }),
  setCidade: (cidade) =>
    set(() => {
      localStorage.setItem("cidade", cidade);
      return { cidade };
    }),
  setSetor: (setor) =>
    set(() => {
      localStorage.setItem("setor", setor);
      return { setor };
    }),

  reset: () =>
    set(() => {
      localStorage.removeItem("ano");
      localStorage.removeItem("mes");
      localStorage.removeItem("cidade");
      localStorage.removeItem("setor");

      return {
        ano: "Todos",
        mes: "Todos",
        cidade: "Todos",
        setor: "Todos",
      };
    }),
}));
