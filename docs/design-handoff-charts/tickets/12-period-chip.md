# 12 — Period chip in page header

**Phase:** 4 (Polish &amp; system) · **Effort:** S · **Impact:** Medium

## Goal

`FilterBar` lets users set a year range, but once applied the chosen period isn't visible anywhere on the page. Promote it to a **chip next to the page title** so the user always knows what slice of the data they're looking at.

The chip is clickable: clicking it scrolls to / opens the FilterBar.

## Files

- **Edit:** `src/components/FilterBar.jsx` — expose a serialized "active period" string and an open/scroll handler.
- **Edit:** `src/components/nid/Panel.jsx` — `NidPageHeader` accepts a `chips` slot.
- **Edit:** consumer pages (`PibPage`, `ArrecadacaoPage`, `CagedPage`, …) — pass current filter into `<NidPageHeader chips=…>`.

## Target visual

```
PIB — Produto Interno Bruto                                  [ 2018–2023 ✕ ]   [ EST ✕ ]
Série histórica do PIB municipal.
```

## API additions

### FilterBar — emit chips

```jsx
// FilterBar already takes {value: {yearFrom, yearTo}, onChange}.
// Add helpers exported alongside it.
export function describeFilter({ yearFrom, yearTo }) {
  if (!yearFrom && !yearTo) return null;
  if (yearFrom && yearTo)   return `${yearFrom}–${yearTo}`;
  if (yearFrom)             return `desde ${yearFrom}`;
  return `até ${yearTo}`;
}
export function clearFilter() {
  return { yearFrom: "", yearTo: "" };
}
```

### NidPageHeader — accept chips

```jsx
// src/components/nid/Panel.jsx
export function NidPageHeader({ title, sub, chips }) {
  return (
    <div className="nid-page-header">
      <div className="nid-page-header-left">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {chips && chips.length > 0 && (
        <div className="nid-page-header-chips">
          {chips.map((c, i) => (
            <button
              key={i}
              className={`nid-pill ${c.active ? "active" : ""}`}
              onClick={c.onClick}
              aria-label={c.label}
            >
              {c.label}
              {c.onClear && (
                <span className="x" onClick={(e) => { e.stopPropagation(); c.onClear(); }}>
                  ✕
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### CSS

```css
.nid-page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 22px;
}
.nid-page-header-left h1 {
  font: 700 24px/1.1 var(--font-display);
  letter-spacing: -0.02em;
  color: var(--text); margin: 0;
}
.nid-page-header-left p {
  margin: 6px 0 0;
  font-size: 13px; color: var(--text-dim);
}
.nid-page-header-chips {
  display: flex; gap: 8px; flex-wrap: wrap;
}
/* .nid-pill already exists; add .active variant if missing */
.nid-pill.active {
  background: color-mix(in oklab, var(--accent-1) 14%, transparent);
  border-color: color-mix(in oklab, var(--accent-1) 35%, transparent);
  color: var(--text);
}
.nid-pill .x {
  margin-left: 6px; color: var(--text-mute);
  cursor: pointer;
}
.nid-pill .x:hover { color: var(--text); }
```

## Page-level wiring

```jsx
// PibPage.jsx
import { NidPageHeader } from "../../components/nid/Panel";
import FilterBar, { describeFilter, clearFilter } from "../../components/FilterBar";

const periodLabel = describeFilter(filters);

<NidPageHeader
  title="PIB — Produto Interno Bruto"
  sub="Série histórica do PIB municipal"
  chips={[
    periodLabel && {
      label: periodLabel,
      active: true,
      onClick: () => document.getElementById("filter-bar")?.scrollIntoView({ block: "center", behavior: "smooth" }),
      onClear: () => setFilters(clearFilter()),
    },
  ].filter(Boolean)}
/>

<FilterBar id="filter-bar" years={years} value={filters} onChange={setFilters} />
```

(Note: top-level rules say avoid `scrollIntoView`. Use it here only because the FilterBar is a stable element with a known id; if it causes any layout issue, swap for a `setExpanded(true)` state pattern that opens FilterBar in place. See the project's existing scroll patterns first.)

## Apply to other pages

The same one-line addition lands on every page that uses `FilterBar`:

- `ArrecadacaoPage`
- `CagedPage`
- `EstbanPage`
- `InssPage`
- `BolsaFamiliaPage`
- `PeDeMeiaPage`
- `RaisPage`
- `ComexPage`
- `PixPage`

## Acceptance criteria

- [ ] `NidPageHeader` accepts a `chips` array.
- [ ] When filters are active, a chip with the period label appears next to the page title.
- [ ] The chip is clickable (focuses the FilterBar) and has an ✕ to clear.
- [ ] Cleared chip disappears immediately on click.
- [ ] No layout shift when the chip appears/disappears (FilterBar takes its own row below).
- [ ] Wired on at least 5 pages.
- [ ] Works in all 5 themes.
