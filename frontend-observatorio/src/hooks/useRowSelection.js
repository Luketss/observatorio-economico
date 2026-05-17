import { useState, useCallback } from "react";

export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setAll = useCallback((ids) => setSelectedIds(new Set(ids)), []);

  return { selectedIds, setSelectedIds, clear, toggle, setAll, count: selectedIds.size };
}
