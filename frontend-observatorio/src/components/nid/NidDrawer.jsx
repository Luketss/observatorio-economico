// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Painel lateral de detalhes (desliza da direita, altura total).
 * AnimatePresence embutido — a página só alterna `open`.
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
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="nid-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            <button onClick={onClose} className="nid-drawer__close" aria-label="Fechar">
              <XMarkIcon className="w-5 h-5" />
            </button>
            {hero && <div className="nid-drawer__hero">{hero}</div>}
            <div className="nid-drawer__body">{children}</div>
            {footer && <div className="nid-drawer__footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
