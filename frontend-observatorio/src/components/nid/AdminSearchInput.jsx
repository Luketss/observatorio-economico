import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Themed search input for admin list pages.
 * Styled by `.nid-admin-search*` rules in themes.css.
 */
export default function AdminSearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  ariaLabel,
  className = "",
}) {
  return (
    <div className={`nid-admin-search ${className}`}>
      <MagnifyingGlassIcon className="nid-admin-search__icon" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className="nid-admin-search__input"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="nid-admin-search__clear"
        >
          <XMarkIcon style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
}
