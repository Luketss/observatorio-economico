// Registro de exportacao dos graficos para o menu "Exportar" do NidPanel.
// Dois contextos: as funcoes (estaveis) para os graficos registrarem sem
// re-renderizar quando a lista muda, e a lista para o menu ler.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const FuncoesCtx = createContext(null);
const ListaCtx = createContext(null);

export function ExportProvider({ children }) {
  const [registros, setRegistros] = useState([]);

  const registrar = useCallback((reg) => {
    setRegistros((atual) => {
      const i = atual.findIndex((r) => r.id === reg.id);
      if (i === -1) return [...atual, reg];
      const copia = atual.slice();
      copia[i] = reg;
      return copia;
    });
  }, []);

  const remover = useCallback((id) => {
    setRegistros((atual) => (atual.some((r) => r.id === id) ? atual.filter((r) => r.id !== id) : atual));
  }, []);

  const funcoes = useMemo(() => ({ registrar, remover }), [registrar, remover]);

  return (
    <FuncoesCtx.Provider value={funcoes}>
      <ListaCtx.Provider value={registros}>{children}</ListaCtx.Provider>
    </FuncoesCtx.Provider>
  );
}

// Fora de um ExportProvider e no-op: graficos usados sem NidPanel seguem iguais.
// `colunas`/`linhas` devem vir memoizados pelo chamador (useMemo), senao o
// efeito re-registra a cada render.
export function useRegistrarExportacao({ id, rotulo, colunas, linhas, svgRef, carregando }) {
  const funcoes = useContext(FuncoesCtx);
  const registrar = funcoes ? funcoes.registrar : null;
  const remover = funcoes ? funcoes.remover : null;
  const carregandoBool = Boolean(carregando);

  useEffect(() => {
    if (!registrar) return undefined;
    registrar({ id, rotulo, colunas, linhas, svgRef, carregando: carregandoBool });
    return undefined;
  }, [registrar, id, rotulo, colunas, linhas, svgRef, carregandoBool]);

  useEffect(() => {
    if (!remover) return undefined;
    return () => remover(id);
  }, [remover, id]);
}

export function useExportacoes() {
  const lista = useContext(ListaCtx);
  return lista || [];
}
