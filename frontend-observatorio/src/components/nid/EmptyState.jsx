// EmptyState — ticket 23
// Admin empty states with 4 variants.
// Reuses ChartState structure from ticket 09 (sibling component, not nested).
//
// Props:
//   kind            "list-empty" | "search-empty" | "permission-empty" | "error-empty"
//   title           string — primary heading
//   detail          string — secondary copy (optional)
//   primaryAction   { label, onClick, icon? } — optional primary CTA button
//   secondaryAction { label, onClick } — optional secondary CTA button
//   className       string — extra CSS classes

import {
  PlusIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

const ICONS = {
  "list-empty":       PlusIcon,
  "search-empty":     MagnifyingGlassIcon,
  "permission-empty": LockClosedIcon,
  "error-empty":      ExclamationCircleIcon,
};

export default function EmptyState({
  kind = "list-empty",
  title,
  detail,
  primaryAction,    // { label, onClick, icon? }
  secondaryAction,  // { label, onClick }
  className = "",
}) {
  const Icon = ICONS[kind] || PlusIcon;
  return (
    <div className={`nid-empty-state nid-empty-state--${kind} ${className}`}>
      <div className="nid-empty-state__ico"><Icon className="w-5 h-5" /></div>
      <h4 className="nid-empty-state__title">{title}</h4>
      {detail && <p className="nid-empty-state__detail">{detail}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="nid-empty-state__actions">
          {primaryAction && (
            <button onClick={primaryAction.onClick} className="nid-empty-state__primary">
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="nid-empty-state__secondary">
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
