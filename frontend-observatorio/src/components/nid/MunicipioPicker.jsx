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
    // Cinto e suspensório: mesmo sem <button> ancestral, nenhuma tecla da busca
    // deve disparar atalho de container acima.
    e.stopPropagation();
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
    <div
      className="nid-municipio-picker"
      ref={wrapRef}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="municipio-picker-list"
      aria-activedescendant={open && filtered[activeIdx] ? `municipio-opt-${activeIdx}` : undefined}
    >
      {/* Fechado vira <button>, aberto vira <div> com o input. Os dois nunca
          coexistem: input dentro de button faz a barra de espaço ativar o botão
          (e fechar a lista), além de ser marcação inválida. */}
      {open ? (
        <div className="nid-municipio-picker__trigger is-open">
          <MagnifyingGlassIcon className="nid-municipio-picker__icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar município…"
            className="nid-municipio-picker__input"
            aria-autocomplete="list"
            aria-controls="municipio-picker-list"
          />
          <ChevronDownIcon className="nid-municipio-picker__chevron" />
        </div>
      ) : (
        <div className="nid-municipio-picker__trigger">
          <button
            type="button"
            className="nid-municipio-picker__campo"
            onClick={openAndFocus}
            aria-label={ariaLabel}
          >
            <MagnifyingGlassIcon className="nid-municipio-picker__icon" />
            <span className={`nid-municipio-picker__display ${!selected ? "is-placeholder" : ""}`}>
              {selected ? `${selected.nome} — ${selected.estado}` : placeholder}
            </span>
          </button>
          {selected && (
            <button
              type="button"
              aria-label="Limpar seleção"
              className="nid-municipio-picker__clear"
              onClick={() => onChange("")}
            >
              <XMarkIcon style={{ width: 14, height: 14 }} />
            </button>
          )}
          {/* Duplica no mouse a ação que o "__campo" já oferece ao teclado e
              ao leitor de tela — sem isso o chevron vira zona morta (era
              clicável quando fazia parte do <button> único de antes).
              tabIndex/aria-hidden evitam um segundo ponto de tabulação e um
              nome acessível repetido. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="nid-municipio-picker__chevron-btn"
            onClick={openAndFocus}
          >
            <ChevronDownIcon className="nid-municipio-picker__chevron" />
          </button>
        </div>
      )}

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
                id={`municipio-opt-${i}`}
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
