// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveisVisiveis(panel) {
  return Array.from(panel.querySelectorAll(FOCAVEIS)).filter((el) => el.offsetParent !== null);
}

function DrawerPanel({ onClose, ariaLabel, hero, footer, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Foco entra no X ao abrir; trap de Tab no documento (recaptura quando o foco
  // escapa do painel); foco volta ao elemento anterior ao desmontar.
  useEffect(() => {
    const anterior = document.activeElement;
    closeRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focaveis = focaveisVisiveis(panelRef.current);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (!panelRef.current.contains(ativo)) {
        e.preventDefault();
        primeiro.focus();
        return;
      }
      if (e.shiftKey && ativo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, []);

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
 * Foco: entra no X, Tab preso no painel (trap no documento, com recaptura
 * quando o foco escapa), devolvido ao gatilho ao fechar.
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
