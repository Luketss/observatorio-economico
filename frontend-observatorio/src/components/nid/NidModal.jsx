import { useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export default function NidModal({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,               // ReactNode — full control of buttons
  size = "md",          // "sm" | "md" | "lg"
  closeOnBackdrop = true,
}) {
  const handleClose = useCallback(() => onClose?.(), [onClose]);

  // Close on Escape via existing hook
  useEscapeKey(handleClose, open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="nid-modal__mask"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (closeOnBackdrop && e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            className={`nid-modal nid-modal--${size}`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="nid-modal__header">
              <div>
                {eyebrow && <p className="nid-modal__eyebrow">{eyebrow}</p>}
                {title && <h4 className="nid-modal__title">{title}</h4>}
              </div>
              <button
                onClick={handleClose}
                className="nid-modal__close"
                aria-label="Fechar"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="nid-modal__body">{children}</div>
            {footer && <div className="nid-modal__footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Convenience field component for forms inside the modal
export function NidField({ label, children }) {
  return (
    <div className="nid-field">
      <label className="nid-field__label">{label}</label>
      {children}
    </div>
  );
}
