# Handoff: Charts &amp; Data Display Redesign

## Overview

This package contains the design direction for a refresh of the chart layer and data-display patterns across the **Observatório Econômico Municipal** frontend (`frontend-observatorio`). It does **not** redesign navigation, the sidebar, the auth flow, or admin pages — only the components and patterns that present quantitative data to users.

Scope: KPI cards, time-series charts, stacked composition charts, twin-bar (CAGED) charts, multi-line comparison charts, donuts, ranking bars, and the tables / empty / loading states that surround them.

The package is organized as a series of **15 tickets**, sized from S (afternoon's work) to M (1–2 days), grouped into 4 implementation phases. Each ticket lives in `tickets/` with code-level detail.

---

## About the design files

The file `Charts Review.html` in this folder is a **design reference**, not production code. It's a single self-contained HTML document with hand-crafted SVG mockups that show the intended visual direction (current vs proposed) for every chart family. It uses the same NID design tokens that live in the real codebase (`src/styles/themes.css`), so colors, type, and shadows will match when ported.

**The task is to implement the proposed designs inside the existing codebase**, reusing and extending the existing components (`src/components/nid/charts.jsx`, `src/components/KpiCard.jsx`, etc.) — not to copy the HTML directly. Where this README shows code, treat it as a target API or shape, not a paste-in implementation.

## Fidelity

**High-fidelity.** Every color, type ramp, spacing value, and radius in the review document maps to an existing CSS custom property in `src/styles/themes.css`. Implementations should hit pixel parity with the proposed-side mockups in `Charts Review.html`.

---

## Target codebase

- **Framework:** React 18 + Vite
- **Styling:** Tailwind utility classes + the custom NID theme system (`src/styles/themes.css`, `src/styles/global.css`)
- **Icons:** `@heroicons/react`
- **Animation:** `framer-motion`
- **Existing chart libs:**
  - `src/components/nid/charts.jsx` — custom NID charts (the target library to keep and extend)
  - `recharts` — currently used in `src/pages/pib/PibPage.jsx` only; to be removed (see ticket 02)
- **Themes:** 5 themes are supported (neon, aurora, sunset, minimal, light). All new chart styling MUST read from CSS custom properties, never hard-code colors.

### File map — where each change lands

```
src/
├── components/
│   ├── KpiCard.jsx                          ← Ticket 01
│   ├── FilterBar.jsx                        ← Ticket 12 (period chip)
│   ├── nid/
│   │   ├── charts.jsx                       ← Tickets 03, 04, 05, 06, 07, 08, 11, 14
│   │   ├── ChartState.jsx (NEW)             ← Ticket 09
│   │   ├── ChartHoverContext.jsx (NEW)      ← Ticket 14 (optional)
│   │   └── Panel.jsx                        ← (used by all pages, no changes)
├── pages/
│   ├── pib/PibPage.jsx                      ← Ticket 02 (Recharts migration)
│   ├── caged/CagedPage.jsx                  ← Ticket 05 (saldo mode default)
│   ├── DashboardGeralPage.jsx               ← Ticket 01 hero strip variant
│   └── comparativo/ComparativoPage.jsx      ← Ticket 06 (focus + context)
├── hooks/
│   └── useChartTheme.js                     ← Ticket 11 (glow tokens)
└── styles/
    ├── global.css                           ← Ticket 13 (tnum)
    └── themes.css                           ← (existing — read-only reference)
```

---

## Implementation phases

### Phase 1 — Foundations (highest leverage)

These touch every page in the app and should ship first.

| #  | Ticket                                          | Effort | Impact |
| -- | ----------------------------------------------- | ------ | ------ |
| 01 | KpiCard v2 — inline delta + sparkline           | S      | High   |
| 02 | PibPage migration off Recharts                  | M      | High   |
| 03 | Chart axis cleanup (Y-caption, monochrome)      | S      | Medium |
| 11 | Glow tokens — reserve glow for hover            | S      | Medium |

### Phase 2 — Time-series storytelling

| #  | Ticket                                          | Effort | Impact |
| -- | ----------------------------------------------- | ------ | ------ |
| 04 | Benchmark + forecast + annotations (line/area)  | M      | High   |
| 05 | CAGED saldo mode (TwinBarChart default)         | S      | High   |

### Phase 3 — Comparison &amp; ranking

| #  | Ticket                                          | Effort | Impact |
| -- | ----------------------------------------------- | ------ | ------ |
| 06 | MultiLineChart focus + context                  | M      | High   |
| 07 | DonutChart → 100% bar fallback                  | S      | Medium |
| 08 | HBarChart grid rewrite + own-município highlight | S      | High   |

### Phase 4 — Polish &amp; system

| #  | Ticket                                          | Effort | Impact |
| -- | ----------------------------------------------- | ------ | ------ |
| 09 | Designed empty + loading states (`ChartState`)  | S      | Medium |
| 10 | Table enhancements — spark column + delta + heat | S      | Medium |
| 12 | Period chip in page header                      | S      | Medium |
| 13 | Tabular numerals globally                       | S      | Low    |
| 14 | Cross-chart hover sync (optional)               | M      | Low    |
| 15 | Annotation overlay layer (optional)             | M      | Medium |

---

## Design tokens (reference only — don't hard-code, read from CSS vars)

These live in `src/styles/themes.css` and are already wired to all 5 themes. All chart code must use `var(--name)`; never `#00e5ff` etc.

### Colors

| Token              | Neon (default)            | Purpose                                |
| ------------------ | ------------------------- | -------------------------------------- |
| `--bg`             | `#050610`                 | App background                          |
| `--panel`          | `rgba(13,17,35,0.72)`     | Card / chart panel                      |
| `--panel-2`        | `rgba(20,24,45,0.55)`     | Recessed surface (KPI sub, table head)  |
| `--text`           | `#eef0ff`                 | Primary text                            |
| `--text-dim`       | `#7c87b3`                 | Secondary text                          |
| `--text-mute`      | `#4c5378`                 | Captions, tertiary                      |
| `--border`         | `rgba(120,145,255,0.10)`  | Default border                          |
| `--border-strong`  | `rgba(120,145,255,0.22)`  | Active / hover border                   |
| `--grid`           | `rgba(120,145,255,0.06)`  | Chart gridlines                         |
| `--accent-1`       | `#00e5ff` (cyan)          | Primary series                          |
| `--accent-2`       | `#ff3d92` (pink)          | "You" / own município / negative        |
| `--accent-3`       | `#b97cff` (purple)        | Forecast                                |
| `--accent-4`       | `#ffd23f` (yellow)        | Tertiary                                |
| `--accent-5`       | `#4ade80` (green)         | Positive / "up" / saldo positivo        |
| `--glow-on`        | `1` (neon/aurora), `0` (minimal/light) | Multiplier for glow effects |

### Typography

| Token             | Value                                              |
| ----------------- | -------------------------------------------------- |
| `--font-display`  | `"Geist", "Inter", sans-serif`                     |
| `--font-mono`     | `"JetBrains Mono", "SF Mono", ui-monospace, Menlo` |

Use mono for axis ticks, value pills, time/date stamps, captions; display for headings and large numbers.

### Spacing

Charts use these consistent paddings (already in `charts.jsx`):
- `padL: 56, padR: 16, padT: 14, padB: 34` — the standard cartesian frame
- Card padding: `18px 20px` (.nid-panel) or `18px 18px 16px` (.nid-kpi)
- Card radius: `18px`

### Shadows

`var(--shadow-card)` — themed shadow already wired per theme.

---

## Implementation notes that apply to every ticket

1. **Theme-safety:** every color, glow, and grid must come from `var(--...)`. Test by switching `body.theme-neon` → `body.theme-light` in devtools. If anything looks broken in light mode, the implementation is using a hard-coded color.
2. **Glow:** wrap glow filters in `opacity={var(--glow-on)}` or a `useChartTheme()` reading so they vanish in minimal/light themes (this already partially works — see existing `glow` prop in `charts.jsx`; ticket 11 finishes the job).
3. **Tabular numerals:** any number in a chart, KPI, or table must use `font-feature-settings: "tnum"`. Add this once in `global.css` on `.nid-mono`, `.nid-kpi-value`, `.axis-text` (ticket 13).
4. **A11y:** keep current ARIA patterns; new interactive elements (tabs, focus toggles) need keyboard support and `aria-pressed` / `aria-selected`.
5. **No new dependencies.** Everything below is achievable with React, SVG, CSS, and the existing libs. If a ticket seems to need a new dep, flag it back to the design team — don't add it.

---

## Acceptance for the package as a whole

Once all phase-1, 2, and 3 tickets are merged, the following should be true on every page that displays charts:

- KPI cards show a delta chip and (when data permits) a sparkline.
- No page uses Recharts.
- Y axes don't repeat "R$" on every tick.
- The only saturated color in a comparison chart is the user's own município; peers are muted grey.
- Donuts only appear when there are exactly 2 slices.
- Ranking charts have a position column and visibly highlight the user's município.
- Glow only fires on hovered / focused elements in dark themes, and never in minimal/light.
- Empty and loading states match the shape of the chart they're replacing.

---

## Files in this handoff

```
design_handoff_charts_redesign/
├── README.md                          ← this file
├── Charts Review.html                 ← visual reference (open in a browser)
└── tickets/
    ├── 01-kpi-card-v2.md
    ├── 02-recharts-migration.md
    ├── 03-chart-axis-cleanup.md
    ├── 04-line-benchmark-forecast-annotations.md
    ├── 05-caged-saldo-mode.md
    ├── 06-multiline-focus-context.md
    ├── 07-donut-fallback.md
    ├── 08-hbar-grid-rewrite.md
    ├── 09-chart-state-component.md
    ├── 10-table-enhancements.md
    ├── 11-glow-tokens.md
    ├── 12-period-chip.md
    ├── 13-tabular-numerals.md
    ├── 14-cross-chart-hover.md          (optional)
    └── 15-annotation-overlay.md         (optional)
```
