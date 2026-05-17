# 08 — HBarChart grid rewrite + own-município highlight

**Phase:** 3 (Comparison &amp; ranking) · **Effort:** S · **Impact:** High

## Goal

Rewrite `HBarChart` from SVG + absolute-positioned label overlay into a clean grid-row component. Add:

- **Position column** (`#1`, `#2`, …).
- **Own-município highlight** (`highlight` prop).
- **Tab toggle** (Top 8 / Vizinhos / Tudo) — handled at the page level.

Drops the dual-coordinate-system fragility of today's SVG + flexbox-overlay approach.

## Files

- **Edit:** `src/components/nid/charts.jsx` — `HBarChart`
- **Edit:** `src/components/nid/ComparativoPanel.jsx` (the wrapper that uses it)

## Target API

```jsx
<HBarChart
  data={[
    { label: "Belo Horizonte", value: 92_500_000_000 },
    { label: "Uberlândia",     value: 28_400_000_000 },
    { label: "Contagem",       value: 24_100_000_000 },
    …
  ]}
  highlight="Uberlândia"       // NEW — matches against d.label
  showPosition                  // NEW — render #1 #2 … column
  positionOffset={0}            // NEW — useful when paged ("Tudo" → vizinhos paged)
  fmt={fmtMoneyShort}
  color="var(--accent-1)"       // peer/default bar color
  highlightColor="var(--accent-2)"  // NEW — own bar color
/>
```

Old call sites without `highlight` keep current behavior visually (all bars `--accent-1`).

## Visual spec (Charts Review.html section 07)

```
#1   ████████████████████████████ Belo Horizonte               R$ 92.5 Bi
#2   ████████ Uberlândia                            você      R$ 28.4 Bi   ← accent-2
#3   ███████ Contagem                                          R$ 24.1 Bi
#4   ██████ Juiz de Fora                                       R$ 21.7 Bi
…
```

- Each row: grid `24px 1fr 90px` for position / bar / value
- Bar is a `<div>` with `width: ${pct}%`, background gradient on accent
- City label sits **on top of the bar**, left-padded 10px, with `text-shadow` for legibility
- "você" tag appears next to the highlighted city's label
- Position number turns `--accent-2` for the highlighted row

## Implementation

```jsx
export function HBarChart({
  data, highlight, showPosition = true, positionOffset = 0,
  color = "var(--accent-1)", highlightColor = "var(--accent-2)",
  fmt = fmtMoneyFull,
}) {
  if (!data || data.length === 0) return <EmptyChart h={240} />;
  const max = Math.max(...data.map((d) => d.value)) || 1;

  return (
    <div className="nid-hbar" role="list">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const isOwn = highlight && d.label === highlight;
        const barColor = isOwn ? highlightColor : color;
        return (
          <div className="nid-hbar-row" key={d.label} role="listitem"
            aria-label={`${i + 1 + positionOffset}. ${d.label}: ${fmt(d.value)}`}>
            {showPosition && (
              <span className={`pos ${isOwn ? "own" : ""}`}>
                #{i + 1 + positionOffset}
              </span>
            )}
            <div className="bar-wrap">
              <div
                className={`bar ${isOwn ? "own" : ""}`}
                style={{ width: `${pct}%`, ["--bar"]: barColor }}
              />
              <span className={`city ${isOwn ? "own" : ""}`}>{d.label}</span>
            </div>
            <span className={`val ${isOwn ? "own" : ""}`}>{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
```

## CSS (themes.css)

```css
.nid-hbar { display: flex; flex-direction: column; }
.nid-hbar-row {
  display: grid;
  grid-template-columns: 28px 1fr 100px;
  gap: 12px; align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.nid-hbar-row:last-child { border-bottom: none; }

.nid-hbar-row .pos {
  font: 700 11px/1 var(--font-mono);
  color: var(--text-mute);
  text-align: right;
  letter-spacing: 0.04em;
}
.nid-hbar-row .pos.own { color: var(--accent-2); }

.nid-hbar-row .bar-wrap {
  position: relative; height: 26px;
}
.nid-hbar-row .bar {
  position: absolute; inset: 0 auto 0 0;
  border-radius: 5px;
  background: linear-gradient(90deg,
    color-mix(in oklab, var(--bar) 55%, transparent),
    color-mix(in oklab, var(--bar) 12%, transparent));
  border-left: 2px solid var(--bar);
}
.nid-hbar-row .city {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  font: 600 12.5px/1 var(--font-display);
  color: var(--text);
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  max-width: 75%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nid-hbar-row .city.own::after {
  content: "você";
  margin-left: 8px;
  font: 600 9px/1 var(--font-mono);
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--accent-2);
  background: color-mix(in oklab, var(--accent-2) 15%, transparent);
  padding: 2px 5px; border-radius: 3px;
  vertical-align: 1px;
}
.nid-hbar-row .val {
  text-align: right;
  font: 600 12px/1 var(--font-mono);
  color: var(--text-dim);
}
.nid-hbar-row .val.own { color: var(--accent-2); }

/* Light theme: drop the text-shadow */
body.theme-light .nid-hbar-row .city { text-shadow: none; }
body.theme-light .nid-hbar-row .city { color: var(--text); }
```

## Page-level changes

In `ComparativoPanel.jsx` (the wrapper that calls `HBarChart`), pass:

```jsx
<HBarChart
  data={ranking.data}
  highlight={ranking.ownLabel}   // e.g. "Uberlândia" from AuthContext
  fmt={fmt}
  color="var(--accent-1)"
/>
```

The Top 8 / Vizinhos / Tudo tabs change `data` and `positionOffset`:

- **Top 8** → data = top 8 of ranking, offset = 0
- **Vizinhos** → data = own city ± 4 neighbors, offset = (ownRank − 4)
- **Tudo** → paginated, offset = page × pageSize

## Acceptance criteria

- [ ] `HBarChart` rewritten as grid rows; no SVG / absolute label overlay.
- [ ] Position column rendered when `showPosition` is on (default true).
- [ ] When `highlight` matches a row's label, that row uses `highlightColor` and shows a "você" tag.
- [ ] Long city names truncate with ellipsis, not overflow the bar.
- [ ] All colors come from CSS vars; works in all 5 themes.
- [ ] Sets up the wrapper in `ComparativoPanel` to thread `highlight` from `AuthContext`.
- [ ] Container scrolls cleanly if data exceeds 12 rows (vertical scroll on the panel, not the page).
