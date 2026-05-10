---
version: 'alpha'
name: 'Abacus'
description: 'Personal finance, precisely calculated.'

colors:
  # ── Light mode ──
  background: '#ffffff'
  foreground: '#0a0a0a'
  card: '#ffffff'
  card-foreground: '#0a0a0a'
  popover: '#ffffff'
  popover-foreground: '#0a0a0a'
  primary: '#171717'
  primary-foreground: '#fafafa'
  secondary: '#f5f5f5'
  secondary-foreground: '#171717'
  muted: '#f5f5f5'
  muted-foreground: '#737373'
  accent: '#f5f5f5'
  accent-foreground: '#171717'
  destructive: '#e7000b'
  destructive-foreground: '#fafafa'
  border: '#e5e5e5'
  input: '#e5e5e5'
  ring: '#a1a1a1'
  chart-1: '#d4d4d4'
  chart-2: '#737373'
  chart-3: '#525252'
  chart-4: '#404040'
  chart-5: '#262626'
  # Sidebar
  sidebar: '#fafafa'
  sidebar-foreground: '#0a0a0a'
  sidebar-primary: '#171717'
  sidebar-primary-foreground: '#fafafa'
  sidebar-accent: '#f5f5f5'
  sidebar-accent-foreground: '#171717'
  sidebar-border: '#e5e5e5'
  sidebar-ring: '#a1a1a1'

  # ── Dark mode ──
  background-dark: '#0a0a0a'
  foreground-dark: '#fafafa'
  card-dark: '#171717'
  card-foreground-dark: '#fafafa'
  popover-dark: '#171717'
  popover-foreground-dark: '#fafafa'
  primary-dark: '#e5e5e5'
  primary-foreground-dark: '#171717'
  secondary-dark: '#262626'
  secondary-foreground-dark: '#fafafa'
  muted-dark: '#262626'
  muted-foreground-dark: '#a1a1a1'
  accent-dark: '#262626'
  accent-foreground-dark: '#fafafa'
  destructive-dark: '#ff6467'
  destructive-foreground-dark: '#171717'
  border-dark: '#ffffff1a'
  input-dark: '#ffffff26'
  ring-dark: '#737373'
  # Sidebar dark
  sidebar-dark: '#171717'
  sidebar-foreground-dark: '#fafafa'
  sidebar-primary-dark: '#e5e5e5'
  sidebar-primary-foreground-dark: '#171717'
  sidebar-accent-dark: '#262626'
  sidebar-accent-foreground-dark: '#fafafa'
  sidebar-border-dark: '#ffffff1a'
  sidebar-ring-dark: '#737373'

  # ── Semantic ──
  income: '#059669'
  expense: '#e11d48'
  budget-safe: '#10b981'
  budget-warning: '#f59e0b'
  budget-caution: '#f97316'
  budget-over: '#f43f5e'
  pwa-theme: '#0f172a'

typography:
  heading-xl:
    fontFamily: 'Geist Variable'
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.025em
  heading-lg:
    fontFamily: 'Geist Variable'
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.025em
  heading-md:
    fontFamily: 'Geist Variable'
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: -0.025em
  body-lg:
    fontFamily: 'Geist Variable'
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  body-md:
    fontFamily: 'Geist Variable'
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.5
  body-sm:
    fontFamily: 'Geist Variable'
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.5
  label-sm:
    fontFamily: 'Geist Variable'
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.4
  label-uppercase:
    fontFamily: 'Geist Variable'
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.025em
  stat-number:
    fontFamily: 'Geist Variable'
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.025em
    fontFeature: 'tnum'

rounded:
  sm: 0.375rem
  md: 0.5rem
  DEFAULT: 0.625rem
  lg: 0.625rem
  xl: 0.875rem
  2xl: 1.125rem
  3xl: 1.375rem
  4xl: 1.625rem
  full: 9999px

spacing:
  unit: 0.25rem
  xs: 0.125rem
  sm: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  2xl: 1rem
  3xl: 1.5rem
  container-padding: 1rem
  container-padding-desktop: 1.5rem
  card-padding: 1.25rem
  card-gap: 1rem
  section-gap: 1.5rem
  page-bottom-padding: 5rem
  sidebar-width: 14rem

components:
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.xl}'
    padding: '{spacing.card-padding}'
  card-hover:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.xl}'
    padding: '{spacing.card-padding}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0 0.625rem
  button-primary-hover:
    backgroundColor: '#262626'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0 0.625rem
  button-outline:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0 0.625rem
  button-ghost:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0 0.625rem
  input:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0.25rem 0.625rem
  badge-default:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.4xl}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  badge-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.4xl}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  badge-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.destructive-foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.4xl}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  dialog-overlay:
    backgroundColor: '#0000001a'
  dialog-content:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.xl}'
  table-header:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
    typography: '{typography.body-md}'
    height: 2.5rem
  table-row:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.foreground}'
    typography: '{typography.body-sm}'
    height: 2.5rem
  tab-active:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
---

# Abacus

## Overview

Abacus is a personal finance application with a deliberately restrained, neutral visual identity. The design prioritizes clarity, trust, and focus — qualities essential for financial tools where precision and readability are paramount. Every visual choice serves the data: the interface steps back so the user's numbers step forward.

The aesthetic is modern minimalism with a monochromatic core. All structural color tokens are achromatic grays, producing a calm, professional environment that avoids visual noise. The single chromatic accent — a vivid red used exclusively for destructive actions and negative financial values — gains its impact precisely because the rest of the palette withholds color. This creates instant legibility: red always means "pay attention."

Typography reinforces the financial domain. All monetary values use tabular numerals for consistent digit alignment across rows and columns. Headings employ tight tracking for a polished, premium feel. The entire interface uses a single typeface family, Geist Variable, chosen for its neutral, highly readable letterforms at all sizes.

Dark and light modes are equal first-class citizens, with full token coverage for both. The theme flips the brightness hierarchy — near-black surfaces become the foundation, and white borders become translucent overlays — while maintaining identical spatial relationships and interaction patterns.

## Colors

The palette is fundamentally achromatic. Every CSS color token in the layout system has zero chroma and zero hue angle, producing pure grayscale values from white through black. This is an intentional constraint: without hue to lean on, the design derives structure from luminosity contrast alone, creating a disciplined, professional atmosphere.

### Light mode

Light mode surfaces build from pure white upward. The background is maximum brightness white. Cards and popovers share the same white surface. The primary action color is a very dark gray near black, and secondary surfaces sit just below white at a barely perceptible 4% gray tint. Muted foregrounds land at a medium gray for secondary text and metadata, achieving roughly 4.5:1 contrast against white backgrounds for accessibility. The destructive token is a vivid red used exclusively for delete buttons, error states, and negative amounts.

### Dark mode

Dark mode inverts the stack. The background becomes a near-black surface. Cards and popovers step up to a slightly lighter gray. The primary action color inverts from dark to light — white buttons on dark surfaces. Borders become translucent white overlays at 10–15% opacity, creating subtle separation without adding visual weight. The destructive red desaturates slightly for dark mode, shifting to a softer tone that remains clearly red against dark backgrounds.

### Semantic color usage

Outside the structural token system, a small set of semantic colors carries financial meaning:

- **Income / positive**: Emerald green is used for incoming amounts, positive balances, and budget bars under 50% utilization.
- **Expense / negative**: Rose red indicates outgoing amounts, overspending, and amounts below zero.
- **Budget progression**: A four-stop color scale communicates urgency — emerald (safe, <50%), amber (warning, 50–80%), orange (caution, 80–100%), rose (over budget, >100%).
- **Charts**: A 10-color palette covers dashboard visualizations — blue, red, green, amber, purple, pink, teal, orange, indigo, yellow. Category color pickers offer 21 pre-defined colors spanning greens, reds, oranges, yellows, blues, purples, pinks, teals, and a gray.
- **Chrome theme**: The PWA theme and background color is deep navy to provide a branded loading frame before the app renders.

The rule is: structural UI chrome uses the achromatic token system exclusively. Color appears only where it conveys data meaning.

## Typography

Geist Variable is the sole typeface across the entire application. It serves both display and body text, with font weight alone providing hierarchy. The variable font technology ensures crisp rendering at all sizes without loading multiple static weights.

### Hierarchy

Three heading levels cover all display needs. Heading XL is reserved for the landing page hero and nothing else — its large size (1.875rem) at semibold weight commands attention at the entry point. Heading LG at bold weight marks page titles and stat card values on dashboards. Heading MD at semibold weight labels card headers, dialog titles, and the sidebar brand mark.

Body LG and Body MD carry all readable content. Body LG handles card titles, form labels, and the sidebar logo wordmark. Body MD at 0.875rem is the workhorse — button text, navigation links, table headers, input text, and most paragraph content. Body SM at 0.75rem handles metadata, badge labels, tab triggers, and descriptive captions. Label SM at 0.6875rem is used only for mobile navigation, where space is at a premium.

The Label Uppercase style uses wide tracking to create compact, scannable labels for stat card categories and section headers. Stat Number is a specialized variant of Heading LG with tabular numerals and tight tracking, designed exclusively for monetary value display.

### Financial typography rules

Every number that represents currency, a percentage, or a date uses tabular numerals. This means the digits 0–9 occupy identical widths, so columns of numbers align vertically regardless of digit composition. Never use proportional numerals for financial data.

Headings always use tight tracking to reduce letter spacing and create a refined, premium appearance. Uppercase labels use wide tracking to improve legibility at small sizes. Never combine tight and wide tracking on the same element.

Font weight communicates importance without changing size. Bold (700) on page titles. Semibold (600) on headings, card titles, and stat values. Medium (500) on body text, labels, badges, and interactive elements. Regular (400) appears only for long-form descriptive text.

## Layout

The application uses a classic sidebar layout with a responsive stack: sidebar on the left at desktop widths, bottom tab bar on mobile. The content area is centered with a maximum width of 64rem to maintain comfortable line lengths, with generous horizontal padding that scales from 1rem on mobile to 1.5rem on desktop.

### App shell

```
┌──────────────────────────────────────────┐
│  Sidebar (14rem)     │  Content          │
│                       │  max-width: 64rem │
│  ┌──────────────┐    │  centered         │
│  │ Brand mark   │    │  padding:         │
│  │ Navigation   │    │    1rem → 1.5rem  │
│  │              │    │                   │
│  └──────────────┘    │                   │
│                       │                   │
├───────────────────────┤                   │
│  Mobile Nav (bottom)  │                   │
└──────────────────────────────────────────┘
```

The sidebar is 14rem wide with a 3.5rem brand header bearing the letterform logo and wordmark. Navigation links stack vertically with generous tap targets. The mobile navigation bar sits at the bottom of the viewport with a glass-morphism treatment, always accessible regardless of scroll position. Page content compensates with 5rem bottom padding on mobile to prevent the nav bar from obscuring content.

### Spacing rhythm

Pages follow a consistent vertical rhythm. The top of every page has the title block — a heading followed by an optional muted description — followed by the first content section at 1.5rem below. Content sections themselves use the same 1.5rem gap. Within sections, a 1rem grid gap organizes cards and content blocks.

Cards have 1.25rem internal padding and 1rem internal gaps. Form fields and button groups use tighter 0.5rem spacing. Navigation links use minimal 0.125rem gaps to maximize density.

### Responsive behavior

At mobile widths, the sidebar disappears and content spans the full width. The layout single-columns naturally. Grid layouts that use two columns at desktop collapse to one. Dialogs remain centered and constrained. Tables gain horizontal scroll. Every interactive element maintains a minimum 2rem height (touch target) regardless of viewport size.

## Elevation

Abacus uses three elevation levels, applied through a combination of ring outlines and box shadows. There are no heavy drop shadows; depth is communicated through subtle visual layering.

### Level 1: Surface (flat)

**Usage:** Cards, stat panels, empty states, chart containers, non-modal panels.
**Visual:** 1px ring at 10% foreground opacity on a rounded white (or dark) card surface. No box shadow. The ring provides just enough edge definition to separate the card from the background without creating separation anxiety. On hover, the ring intensifies to 15% foreground opacity over 200ms.

This is the dominant container pattern across the entire application — every card, stat display, and content panel uses this exact border treatment. It replaces heavier `border-border` borders, creating a lighter, more refined look.

### Level 2: Raised

**Usage:** Dropdown menus, select popovers, popup panels, submenus.
**Visual:** A medium box shadow combined with the standard 1px ring. The shadow creates separation from underlying content, while the ring maintains edge definition. Dropdown items have a 0.5rem border radius and highlight with the secondary background color on focus.

### Level 3: Elevated

**Usage:** Sheets, chart tooltips, global notification banners, submenus of submenus.
**Visual:** A larger box shadow with greater spread. Sheets emerge from screen edges with a transition on transform and opacity over 250ms. Tooltips appear with zoom and fade animations.

### Glass accents

Mobile navigation uses `backdrop-filter: blur` layered over a semi-transparent card background, creating a frosted glass effect. This lets content scroll behind the nav bar while keeping navigation elements legible. Dialog overlays optionally use a subtle backdrop blur when the browser supports it.

### Micro-interactions

- **Button press:** Buttons translate 1px downward on active press, mimicking physical depression.
- **Icon hover:** Navigation icons scale to 110% on hover, creating a responsive, tactile feel.
- **Card hover:** Cards transition their ring from 10% to 15% foreground opacity over 200ms.
- **Budget bars:** Width transitions animate over 500ms — the slowest animation in the system — to draw attention to changing financial metrics.
- **Page entry:** Route content fades in and slides up 0.5rem over 200ms on navigation.

All interactive transitions use a 200ms duration with ease-out easing. Longer transitions are reserved for data-driven animations where the user needs time to perceive the change.

## Shapes

The radius scale is based on a 0.625rem (10px) base unit, with multipliers producing a graduated family from subtle rounding to fully pill-shaped elements.

### Radius scale

| Level  | Value    | Used on                                                                                   |
| ------ | -------- | ----------------------------------------------------------------------------------------- |
| `sm`   | 0.375rem | Button sizes xs/sm and checkbox inner elements                                            |
| `md`   | 0.5rem   | Dropdown items, select items, tab triggers                                                |
| `lg`   | 0.625rem | Buttons (default/lg), inputs, selects, tabs list, sidebar nav items, stat icon containers |
| `xl`   | 0.875rem | Cards, dialogs, popover panels                                                            |
| `2xl`  | 1.125rem | Card headers (top corners only)                                                           |
| `3xl`  | 1.375rem | —                                                                                         |
| `4xl`  | 1.625rem | Badges (pill shape)                                                                       |
| `full` | 9999px   | Category color circles, progress bars, currency indicators                                |

### Shape philosophy

Interactive elements (buttons, inputs, tabs) use the `lg` radius level, creating a soft but not rounded feel. Containers (cards, dialogs) use `xl` for a more pronounced corner rounding that distinguishes them from the page. Badges use `4xl` — functionally pill-shaped — to clearly differentiate status indicators from interactive elements.

Sheet panels have zero border radius on the anchored edge, flush with the screen boundary. This creates a deliberate contrast with floating elements like dialogs and reinforces the spatial model: sheets are attached to edges, dialogs float above everything.

Checkboxes use a fixed 4px radius that isn't part of the token system — slightly sharp, contrasting with the generally rounded interface, to signal their binary on/off nature.

## Components

### Cards

Cards are the primary content container. Every card uses a white (or near-black in dark mode) background with a 1px ring at 10% foreground opacity, 0.875rem corner radius, and 1.25rem internal padding. Card headers sit at the top with a 0.5rem gap between title and action. Card footers split with a top border at 50% muted opacity, matching the 1.25rem padding.

Cards are designed to stack in grids, typically two columns at desktop and one at mobile. The ring-based border means adjacent cards don't create doubled border lines; instead, the subtle outline lets each card breathe independently.

### Buttons

Six variants share the same geometry: 2rem height, 0.625rem horizontal padding, 0.625rem border radius. Variants differ only in background and text color.

- **Primary:** Filled dark gray (light mode) or light gray (dark mode) background with contrasting text. Used for the single most important action on a page.
- **Secondary:** Filled muted gray background with dark text. Used for less prominent actions.
- **Outline:** Transparent background with a ring outline matching the border color. Used for paired alternatives to primary actions.
- **Ghost:** Fully transparent with no outline. Used in navigation bars, table rows, and contexts where a button should feel embedded, not elevated.
- **Destructive:** Filled red background with white text. Used exclusively for irreversible destructive actions.
- **Link:** Transparent with underline on hover. Used for tertiary in-line actions.

All buttons press 1px downward on click. Focus rings match the ring color at 50% opacity with a 2px offset for accessibility.

Button sizes range from xs (1.5rem height, 6px icon) through lg (2.25rem height, 16px icon). Icon-only buttons match the height of their labeled counterparts and center the icon without extra padding.

### Dialogs

Dialogs are modal overlays with a semi-transparent black backdrop at 10% opacity. The dialog panel floats above with a card background, 0.875rem corner radius, and a close button in the top-right corner. The header uses heading-md typography with `leading-none` for compact titles. The footer stacks action buttons right-aligned with a top border divider, matching the card footer pattern.

Dialog content animates in with a 100ms fade + zoom (95% → 100% scale) and out with the reverse. These are the fastest animations in the system, designed to feel instantaneous.

### Tables

Table headers use the muted background color and medium font weight for clear column labeling. Table rows alternate with transparent backgrounds and highlight with subtle color shifts on hover. Cell content is padded at 0.5rem with body-sm typography. Tables are bordered by their container card and do not have internal vertical borders.

### Tabs

Two tab variants exist. The default variant places triggers in a rounded container with the active tab receiving a white background and subtle shadow. The line variant uses an underline indicator that slides between tabs. Both use body-sm typography at medium weight. Active tabs use the full foreground color; inactive tabs use muted foreground.

### Sheets

Sheets slide in from any screen edge (top, right, bottom, left) with a 250ms transform transition. The anchored edge has zero border radius, flush with the screen. The panel has a card background at 95% opacity. An overlay backdrop fades in behind the sheet. Sheets are used for mobile-adapted navigation and contextual panels.

## Do's and Don'ts

### Structural chrome

- **Do** use the achromatic token system (`primary`, `secondary`, `muted`, etc.) for all UI chrome — navigation, cards, buttons, dialogs, forms, tables.
- **Don't** introduce chromatic colors into structural elements. Color is reserved for data meaning.

### Cards

- **Do** use `ring-1 ring-foreground/10` as the standard card border instead of `border-border`.
- **Don't** use thick borders (`border-2` or heavier) on cards. The ring is always 1px.
- **Do** use `rounded-xl` (0.875rem) for all card containers.
- **Don't** mix different radius levels within the same surface hierarchy.

### Financial data

- **Do** apply tabular numerals to every monetary value, percentage, and date.
- **Don't** use proportional or old-style numerals for any data that might be compared across rows.
- **Do** use emerald green for incoming/positive and rose red for outgoing/negative.
- **Don't** use other colors for income/expense — green and red must be unambiguous.

### Typography

- **Do** use tracking-tight on all headings.
- **Do** use tracking-wide on uppercase labels.
- **Don't** combine tight and wide tracking on the same text element.

### Dark mode

- **Do** provide full dark mode support for every surface, using the dark mode tokens defined in the color palette.
- **Don't** assume light mode colors work in dark mode — border opacity, destructive saturation, and contrast ratios all change.
- **Do** test both modes for every new component.

### Elevation

- **Do** use the three-level elevation system consistently: ring-1 for flat cards, shadow-md for raised popovers, shadow-lg for elevated sheets and tooltips.
- **Don't** introduce additional shadow levels or combine multiple shadows on the same element.

### Animation

- **Do** use 200ms for interactive transitions (hover states, page entry).
- **Do** use 100ms for dialog/modal open/close.
- **Do** use 250ms for sheet entry/exit.
- **Don't** exceed 500ms for any animation — the interface should feel responsive, never sluggish.

### Accessibility

- **Do** maintain at least 4.5:1 contrast for body text against its background in both light and dark modes.
- **Do** provide focus rings on all interactive elements using the ring token at 50% opacity.
- **Don't** rely solely on color to communicate information — pair green/red values with +/- signs.
