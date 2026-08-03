// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCAVEIS =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function DrawerPanel({ onClose, ariaLabel, hero, footer, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Foco entra no X ao abrir; volta ao elemento anterior ao desmontar.
  useEffect(() => {
    const anterior = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, []);

  function handleKeyDown(e) {
    if (e.key !== "Tab") return;
    const focaveis = panelRef.current?.querySelectorAll(FOCAVEIS);
    if (!focaveis || focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="nid-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      ref={panelRef}
      onKeyDown={handleKeyDown}
    >
      <button ref={closeRef} onClick={onClose} className="nid-drawer__close" aria-label="Fechar">
        <XMarkIcon className="w-5 h-5" />
      </button>
      {hero && <div className="nid-drawer__hero">{hero}</div>}
      <div className="nid-drawer__body">{children}</div>
      {footer && <div className="nid-drawer__footer">{footer}</div>}
    </motion.div>
  );
}

/**
 * Painel lateral de detalhes (desliza da direita, altura total).
 * AnimatePresence embutido — a página só alterna `open`.
 * Foco: entra no X, Tab preso no painel, devolvido ao gatilho ao fechar.
 * Escape fica a cargo da página (useEscapeKey), como nos modais.
 */
export default function NidDrawer({ open, onClose, ariaLabel, hero, footer, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="nid-drawer-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <DrawerPanel onClose={onClose} ariaLabel={ariaLabel} hero={hero} footer={footer}>
            {children}
          </DrawerPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
