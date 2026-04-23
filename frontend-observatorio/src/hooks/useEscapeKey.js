import { useEffect } from "react";

export function useEscapeKey(handler, active = true) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e) {
      if (e.key === "Escape") handler();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler, active]);
}
