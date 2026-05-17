# 13 — Tabular numerals globally

**Phase:** 4 (Polish &amp; system) · **Effort:** S · **Impact:** Low

## Goal

Every number on screen — KPI values, axis ticks, table cells, tooltips, the ranking values — should use **tabular-figure** glyphs so columns of numbers align vertically and animated values don't jitter as digit widths change.

Geist supports tabular figures via `font-feature-settings: "tnum"`. `.nid-kpi-value` already enables it; extend the rule.

## Files

- **Edit:** `src/styles/global.css`

## The change

Add a single CSS rule that turns on `tnum` on anywhere a number is rendered:

```css
/* Tabular numerals — apply broadly to numeric UI */
.nid-mono,
.nid-kpi-value,
.nid-kpi-foot,
.nid-delta,
.nid-tip .tip-row,
.nid-data-table .mono,
.nid-data-table td.mono,
.axis-text,
.nid-pct-legend,
.nid-hbar-row .pos,
.nid-hbar-row .val,
.nid-page-header-chips,
.code-pill {
  font-feature-settings: "tnum", "cv11", "ss01";
  font-variant-numeric: tabular-nums;
}
```

The double declaration (`font-feature-settings` and `font-variant-numeric`) covers older browsers that respect one or the other.

For new components added by other tickets (DataTable, HBarChart grid rewrite, ChartState), confirm their CSS class names appear in this rule.

## Verification

Render any page. Type into devtools:

```js
$$('.nid-kpi-value').forEach(el => console.log(getComputedStyle(el).fontVariantNumeric));
```

Should report `tabular-nums` on every match.

Visual test: load `DashboardGeralPage` and watch the KPI values update on filter change. Digit widths should be stable; the value text should not wobble horizontally as it animates.

## Acceptance criteria

- [ ] Single rule added to `global.css`.
- [ ] All numeric UI uses tabular figures.
- [ ] No visible regression in non-numeric text (the rule only targets numeric classes).
- [ ] Works in all 5 themes (CSS rule is theme-independent).
