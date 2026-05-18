import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Searchable combobox for picking a município from a long list.
 * Designed as a drop-in replacement for the pattern
 *   <select value={id} onChange={(e) => setId(e.target.value)}>
 *     {municipios.map(m => <option ...>{m.nome} — {m.estado}</option>)}
 *   </select>
 *
 * Keyboard support:
 *   ↓ / ↑ — move highlight  ·  Enter — select  ·  Esc — close
 */
export default function MunicipioPicker({
  municipios = [],
  value,                       // selected id (string or number)
  onChange,                    // (idAsString) => void; "" when cleared
  placeholder = "Selecione um município…",
  ariaLabel = "Selecionar município",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(
    () => municipios.find((m) => String(m.id) === String(value)) || null,
    [municipios, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return municipios;
    return municipios.filter(
      (m) =>
        String(m.nome ?? "").toLowerCase().includes(q) ||
        String(m.estado ?? "").toLowerCase().includes(q) ||
        String(m.codigo_ibge ?? "").toLowerCase().includes(q)
    );
  }, [municipios, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Reset highlight when filter changes; clamp if filtered shrinks below current index
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Keep highlighted option in view as user arrows through
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, open]);

  const openAndFocus = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const choose = (m) => {
    onChange(String(m.id));
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[activeIdx];
      if (m) choose(m);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="nid-municipio-picker" ref={wrapRef}>
      <button
        type="button"
        className={`nid-municipio-picker__trigger ${open ? "is-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openAndFocus())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <MagnifyingGlassIcon className="nid-municipio-picker__icon" />
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar município…"
            className="nid-municipio-picker__input"
            onClick={(e) => e.stopPropagation()}
            aria-autocomplete="list"
            aria-controls="municipio-picker-list"
          />
        ) : (
          <span className={`nid-municipio-picker__display ${!selected ? "is-placeholder" : ""}`}>
            {selected ? `${selected.nome} — ${selected.estado}` : placeholder}
          </span>
        )}
        {selected && !open && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar seleção"
            className="nid-municipio-picker__clear"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
          >
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </span>
        )}
        <ChevronDownIcon className="nid-municipio-picker__chevron" />
      </button>

      {open && (
        <ul
          id="municipio-picker-list"
          className="nid-municipio-picker__list"
          role="listbox"
          ref={listRef}
        >
          {filtered.length === 0 ? (
            <li className="nid-municipio-picker__empty">
              {query
                ? `Nenhum município encontrado para "${query}".`
                : "Nenhum município disponível."}
            </li>
          ) : (
            filtered.map((m, i) => (
              <li
                key={m.id}
                data-idx={i}
                role="option"
                aria-selected={String(m.id) === String(value)}
                onClick={() => choose(m)}
                onMouseEnter={() => setActiveIdx(i)}
                className={
                  "nid-municipio-picker__option" +
                  (i === activeIdx ? " is-active" : "") +
                  (String(m.id) === String(value) ? " is-selected" : "")
                }
              >
                <span className="nid-municipio-picker__nome">{m.nome}</span>
                <span className="nid-municipio-picker__uf">{m.estado}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
