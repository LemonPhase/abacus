/**
 * Chart & data-visualization color constants.
 *
 * **Chart constants** (CHART_COLORS, INCOME_COLOR, GROWTH_COLORS, etc.)
 * use CSS `var(--token)` references so charts auto-respond to light/dark
 * mode. Browsers resolve CSS custom properties in inline SVG `fill`/`stroke`
 * and React inline `style` objects, so these work everywhere Recharts needs
 * a color value.
 *
 * **Data constants** (DEFAULT_CATEGORY_COLOR, CATEGORY_PICKER_COLORS)
 * use hex values because they represent user-storable data — a category's
 * assigned color must be a concrete value, not a theme-dependent reference.
 *
 * RULE: Never hardcode a hex, rgb(), or hsl() value in a component,
 *       page, or hook file. Import the relevant constant from here instead.
 *
 * If you need a color that does not exist here:
 *   1. Add it to this file (as a CSS var ref for charts, or hex for data).
 *   2. If adding a CSS var ref, ensure the corresponding `--token` is
 *      defined in both `:root` and `.dark` blocks in `src/index.css`.
 *
 * Master design reference: `DESIGN.md`
 */

// ── Hex reference values (for non-visual use: fallbacks, DB defaults) ──────

/** Jade hex (light mode). Prefer `var(--jade)` for visual use. */
export const JADE_HEX = '#006b4d'
/** Cinnabar hex (light mode). Prefer `var(--cinnabar)` for visual use. */
export const CINNABAR_HEX = '#e23636'

// ── Income / Expense chart fills ───────────────────────────────────────────

export const INCOME_COLOR = 'var(--jade)'
export const EXPENSE_COLOR = 'var(--cinnabar)'

// ── 10-color chart palette (from DESIGN.md line 259) ──────────────────────

/**
 * Ordered palette for category breakdowns, donut/pie charts, and any
 * data visualization needing multiple distinct warm-tone colors.
 *
 * Each entry is a CSS `var()` reference — colors switch between
 * `:root` (light) and `.dark` (dark mode) automatically.
 */
export const CHART_COLORS = [
  'var(--jade)', // #006b4d / #2dd4a3
  'var(--cinnabar)', // #e23636 / #f87171
  'var(--secondary)', // #5d5f5e / #b0b0ae
  'var(--chart-4)', // #c6c0ba / #6d6660
  'var(--chart-3)', // #8a807d / #a09088
  'var(--muted-foreground)', // #4d4540 / #ccc5be
  'var(--chart-8)', // #ab8f70 (warm earth)
  'var(--foreground)', // #1c1b1b / #efe8e5
  'var(--input)', // #7e7570 / #8a807d
  'var(--chart-5)', // #000000 / #e5ddd9
]

// ── Fallback / default colors (hex — these are data, not styling) ──────────

/** Use when a category has no color set, or as a generic neutral fallback. */
export const DEFAULT_CATEGORY_COLOR = '#4d4540' // matches --muted-foreground

/** Default color for a new category form (jade — positive/income-leaning). */
export const NEW_CATEGORY_DEFAULT_COLOR = JADE_HEX

// ── Investment type color mapping ─────────────────────────────────────────

/**
 * Investment type → color mapping.
 * All tones stay within the warm earth / jade / cinnabar palette.
 * Uses CSS var refs so these auto-adapt to dark mode in charts and badges.
 */
export const INVESTMENT_TYPE_COLORS: Record<string, string> = {
  fixed_income: 'var(--jade)', // stable/growing
  index_fund: 'var(--secondary)', // chart-2
  stock: 'var(--cinnabar)', // volatile
  real_estate: 'var(--chart-8)', // warm earth
  cash: 'var(--chart-3)', // warm mid-gray
  crypto: 'var(--muted-foreground)', // muted
  other: 'var(--input)', // neutral
}

// ── Growth projection line colors (Investments page) ──────────────────────

/** Colors cycled through for multi-plan growth line charts. */
export const GROWTH_COLORS = [
  'var(--jade)',
  'var(--cinnabar)',
  'var(--secondary)',
  'var(--chart-4)',
  'var(--chart-3)',
  'var(--muted-foreground)',
  'var(--chart-8)',
  'var(--input)',
]

// ── Category color picker palette (hex — these are user-selectable data) ───

/**
 * User-facing color swatches shown in the CategoryDialog.
 * Focused on warm earth tones + jade/cinnabar accents.
 * Avoids pure cool blues/cyans per DESIGN.md philosophy.
 *
 * These MUST be hex values because the selected color is stored as the
 * category's color in the database — a theme-dependent CSS variable
 * reference would be confusing as user data.
 */
export const CATEGORY_PICKER_COLORS = [
  '#006b4d', // jade
  '#2dd4a3', // jade-light
  '#e23636', // cinnabar
  '#f87171', // cinnabar-light
  '#000000', // primary
  '#5d5f5e', // secondary
  '#8a807d', // chart-3
  '#c6c0ba', // chart-4
  '#4d4540', // muted-foreground
  '#7e7570', // input
  '#ab8f70', // warm earth
  '#ba1a1a', // destructive
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#a855f7', // violet
  '#d946ef', // pink
  '#ec4899', // hot pink
  '#14b8a6', // teal
  '#64748b', // slate
]
