---
version: 'alpha'
name: 'Abacus'
description: 'Personal finance, precisely calculated.'

colors:
  # ── Light mode — warm paper stack ──
  background: '#fdf8f7'
  foreground: '#1c1b1b'
  card: '#ffffff'
  card-foreground: '#1c1b1b'
  popover: '#f7f3f1'
  popover-foreground: '#1c1b1b'
  primary: '#000000'
  primary-foreground: '#ffffff'
  secondary: '#5d5f5e'
  secondary-foreground: '#ffffff'
  muted: '#ece7e6'
  muted-foreground: '#4d4540'
  accent: '#e6e1e0'
  accent-foreground: '#4d4540'
  destructive: '#ba1a1a'
  destructive-foreground: '#ffffff'
  border: '#d0c4be'
  input: '#7e7570'
  ring: '#1c191733'
  chart-1: '#006b4d'
  chart-2: '#5d5f5e'
  chart-3: '#8a807d'
  chart-4: '#c6c0ba'
  chart-5: '#000000'
  sidebar: '#fdf8f7'
  sidebar-foreground: '#1c1b1b'
  sidebar-primary: '#000000'
  sidebar-primary-foreground: '#ffffff'
  sidebar-accent: '#ece7e6'
  sidebar-accent-foreground: '#1c1b1b'
  sidebar-border: '#d0c4be'
  sidebar-ring: '#1c191733'

  # ── Dark mode — warm night ink ──
  background-dark: '#12100f'
  foreground-dark: '#efe8e5'
  card-dark: '#231f1d'
  card-foreground-dark: '#efe8e5'
  popover-dark: '#1d1a18'
  popover-foreground-dark: '#efe8e5'
  primary-dark: '#e5ddd9'
  primary-foreground-dark: '#12100f'
  secondary-dark: '#b0b0ae'
  secondary-foreground-dark: '#1a1a1a'
  muted-dark: '#2a2624'
  muted-foreground-dark: '#ccc5be'
  accent-dark: '#2f2b29'
  accent-foreground-dark: '#ccc5be'
  destructive-dark: '#ffb4ab'
  destructive-foreground-dark: '#690005'
  border-dark: '#d0c4be1f'
  input-dark: '#8a807d'
  ring-dark: '#e5ddd940'
  chart-1-dark: '#2dd4a3'
  chart-2-dark: '#b0b0ae'
  chart-3-dark: '#a09088'
  chart-4-dark: '#6d6660'
  chart-5-dark: '#e5ddd9'
  sidebar-dark: '#12100f'
  sidebar-foreground-dark: '#efe8e5'
  sidebar-primary-dark: '#e5ddd9'
  sidebar-primary-foreground-dark: '#12100f'
  sidebar-accent-dark: '#2a2624'
  sidebar-accent-foreground-dark: '#efe8e5'
  sidebar-border-dark: '#d0c4be1f'
  sidebar-ring-dark: '#e5ddd940'

  # ── Semantic accent colors ──
  jade: '#006b4d'
  jade-dark: '#2dd4a3'
  cinnabar: '#e23636'
  cinnabar-dark: '#f87171'

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
  label-caps:
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
  sm: 0.125rem
  md: 0.1875rem
  DEFAULT: 0.25rem
  lg: 0.25rem
  xl: 0.75rem
  2xl: 1rem
  3xl: 1.25rem
  4xl: 9999px

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
  sidebar-width: 14rem

components:
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.xl}'
    padding: '{spacing.card-padding}'
  card-premium:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.xl}'
    padding: '{spacing.card-padding}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0 0.625rem
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
  badge-default:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.lg}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  badge-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.destructive-foreground}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.lg}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  input:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.foreground}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    height: 2rem
    padding: 0.25rem 0.625rem
  sidebar:
    backgroundColor: '{colors.sidebar}'
    textColor: '{colors.sidebar-foreground}'
    width: '{spacing.sidebar-width}'
  fab:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '9999px'
    height: 3.5rem
    width: 3.5rem
---

# Abacus — Modern Zen Design System

## Overview

Abacus is a personal finance application with a Modern Zen aesthetic — minimalist architectural precision fused with traditional East Asian stationery. The design targets professionals seeking composed confidence in their financial tools. The emotional response is quiet, focused, high-fidelity — the UI disappears to prioritize the data.

Visual interest comes from high-precision typography, a warm paper-and-ink palette, and a dot-grid background that evokes traditional graph paper. Decorative elements are absent; structural depth comes from tonal surface layering and ultra-thin borders.

## Colors

The palette is rooted in a monochromatic charcoal core against warm, textured paper. All structural color tokens stay within the warm earth spectrum — no cool grays, no blue tones. Pure black is reserved exclusively for the primary action color to create maximum contrast against the paper background.

### Light mode — warm paper stack

The base is warm paper at #fdf8f7 with a charcoal ink foreground at #1c1b1b. Cards elevate to pure white. Popovers sit at one level warmer. The primary action color is pure black. Secondary surfaces use a warm gray at #5d5f5e. Muted and accent surfaces form a graduated warm-gray hierarchy from #ece7e6 through #e6e1e0. The destructive color is a warm red at #ba1a1a, and borders use a warm outline-variant at #d0c4be.

### Dark mode — warm night ink

Dark mode inverts the paper stack into warm night tones. The background becomes a warm near-black at #12100f. Surfaces step up through warm dark grays. The primary action color inverts to a warm light at #e5ddd9. Borders become translucent warm overlays at 12% opacity. The destructive desaturates to #ffb4ab for readability on dark backgrounds.

### Semantic color usage

Beyond the structural token system, two accent colors carry financial meaning:

- **Jade (#006b4d)**: Used exclusively for income, positive balances, growth indicators, and budget bars under 50%. In dark mode, brightens to #2dd4a3.
- **Cinnabar (#e23636)**: Used exclusively for expenses, negative amounts, overspending, and destructive indicators. In dark mode, softens to #f87171.

The rule: structural UI chrome uses the achromatic paper hierarchy. Jade and cinnabar appear only where they convey data meaning. Charts use a warm palette derived from these tokens (#006b4d, #e23636, #5d5f5e, #c6c0ba, #8a807d, #4d4540, #1c1917, #7e7570, #a09088, #ab8f70).

### Background pattern

The body background carries a dot-grid pattern: 0.7px circular dots at 12% charcoal opacity on a 24px grid, rendered via CSS radial gradient with fixed attachment. This creates a subtle graph-paper effect that shows through wherever opaque surfaces (cards, sidebar, header) do not paint over it. Dark mode uses 8% warm-white dots.

## Typography

Geist Variable is the sole typeface. It was chosen for technical precision, clean junctions, and neutral readability at all sizes. Font weight variations create hierarchy without color shifts, maintaining the monochromatic aesthetic.

### Hierarchy

Heading XL (1.875rem, semibold, -0.025em tracking) is reserved for the landing page hero. Heading LG (1.5rem, bold) marks page titles and stat values. Heading MD (1rem, semibold) labels card headers, dialog titles, and the sidebar brand mark. Body LG (1rem, medium) carries card titles and form labels. Body MD (0.875rem, medium) is the workhorse — buttons, navigation, inputs, tables. Body SM (0.75rem, medium) handles metadata, badges, and captions. Label SM (0.6875rem, medium) is used only for mobile navigation. The Label Caps variant adds 0.025em wide tracking for stat card titles and section headers.

### Financial typography rule

Every number representing currency, percentage, or date uses tabular numerals (`font-feature-settings: "tnum"`) for consistent digit alignment. Never use proportional numerals for financial data. Headings use tight tracking (-0.025em to -0.04em) for a locked architectural look. Uppercase labels use wide tracking (0.025em to 0.05em) for legibility at small sizes.

## Layout

The application uses a fixed sidebar with independent content scrolling. The outer container locks to the viewport at full height with overflow hidden. The right column (header + content) scrolls independently, keeping the sidebar always visible.

### App shell

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar (14rem) │ TopHeader (sticky, 64px)             │
│ fixed, full     │ [Search...] [🔔] [?] [A]            │
│ height          │──────────────────────────────────────│
│                 │                                      │
│ ┌───────────┐   │ Content area (scrollable)            │
│ │ A Abacus  │   │ max-width: 1400px, centered          │
│ │ Wealth    │   │                                      │
│ │ Mgmt      │   │                                      │
│ ├───────────┤   │                                      │
│ │ Nav links │   │                                      │
│ │           │   │                                      │
│ │           │   │                                  [+] │
│ └───────────┘   │                                      │
├─────────────────┴──────────────────────────────────────│
│ Mobile Nav (bottom, mobile only)                        │
└─────────────────────────────────────────────────────────┘
```

The sidebar is 14rem wide with the brand mark and navigation links. The TopHeader is sticky within the scrollable right column, carrying a search input, notification and help icons, and a user avatar dropdown. The FAB sits fixed at bottom-right, 56px circular, with a plus icon that navigates to the Transactions page and auto-opens the add dialog.

### Spacing rhythm

Pages follow a consistent vertical rhythm with 1.5rem section gaps. Cards use 1.25rem internal padding and 1rem internal gaps. Form fields and button groups use 0.5rem spacing. Content is centered with a maximum width of 1400px, with padding that scales from 1rem on mobile to 1.5rem on desktop. The mobile nav requires 5rem bottom padding on content to prevent overlap.

## Elevation

Depth is created through tonal layering and thin borders rather than drop shadows.

### Levels

- **Surface (flat)**: Cards, stat panels, chart containers. Use `border border-border/30` on a card background. 12px corner radius.
- **Premium surface**: The primary stat card (Net Worth) uses a solid black background with white text and a subtle primary-tinted border. This premium treatment is applied to exactly one card per page.
- **Raised**: Dropdown menus, select popovers, popups. Use `shadow-md` combined with the border pattern.
- **Elevated**: Sheet panels, tooltips, error banners. Use `shadow-lg`.

### Micro-interactions

- Button press: 1px downward translation on active
- Icon hover: 110% scale, 200ms transition
- Card hover: border intensifies from 30% to 10% primary tint
- Budget bars: width transitions over 500ms for financial awareness
- Page entry: fade in + slide up 0.5rem over 200ms
- Dialog open: fade + zoom over 100ms

## Shapes

The radius scale uses a dual strategy: sharp 4px for interactive elements (calligraphic edge) and generous 12px for containers.

| Level | Value     | Used on                                                                        |
| ----- | --------- | ------------------------------------------------------------------------------ |
| `sm`  | 0.125rem  | Button sizes xs/sm inner corners                                               |
| `md`  | 0.1875rem | Dropdown items, select items, tab triggers                                     |
| `lg`  | 0.25rem   | Buttons (default/lg), inputs, selects, badges, tabs, sidebar items, stat icons |
| `xl`  | 0.75rem   | Cards, dialogs, popovers                                                       |
| `2xl` | 1rem      | Card headers (top corners)                                                     |
| `3xl` | 1.25rem   | —                                                                              |
| `4xl` | 9999px    | Pill-shaped elements (progress bars, FAB when using rounded-full)              |

Checkboxes use a fixed 4px radius. Sheet panels have zero radius on the anchored edge. The FAB uses fully rounded corners for a circular profile.

## Components

### Cards

The primary content container. Uses a white or warm card background with a thin warm border, 12px corner radius, and 1.25rem internal padding. Card footers split with a top border at 60% outline-variant opacity. The premium variant inverts to a black background with white text for the primary metric on each page.

### Buttons

Six variants share the same geometry: 2rem height, 0.625rem horizontal padding, 4px border radius. Primary uses solid black with white text. Secondary uses a warm gray fill. Outline uses a transparent background with a warm border ring. Ghost is fully transparent. Destructive uses a warm red. Link uses underline on hover. All buttons press 1px downward on click.

### TopHeader

A sticky 64px header bar at the top of the content area. Contains a search input with light warm-gray background fill, notification and help icons, and a circular user avatar that opens a dropdown with the user email and a sign-out action. Uses background blur for a translucent glass effect over scrolled content.

### Sidebar

A fixed 14rem sidebar with the brand mark, "Abacus" wordmark, "Wealth Management" subtitle, and eight navigation links. Active links receive a warm accent background highlight. Inactive links use muted foreground text with hover highlighting. The sidebar uses warm paper background with a warm outline-variant right border.

### Mobile Navigation

A fixed bottom bar (64px) visible only on mobile. Eight navigation links with icons and labels. Active link uses primary text with a subtle background indicator. Background uses glass-effect blur over the card surface.

### Floating Action Button (FAB)

A fixed 56px circular button at the bottom-right of the viewport. Solid black background with white plus icon. On click, navigates to the Transactions page and auto-opens the add-transaction dialog. Uses shadow for subtle elevation. Hides behind the mobile nav on small screens, positioned above it.

### Dialogs

Modal overlays with a 5% black backdrop. The dialog panel floats centered with a card background, 12px corner radius, warm border, and close button. The footer stacks action buttons right-aligned with a top border divider. Content animates in with a 100ms fade and zoom.

### Tables

Header rows use a warm muted background with medium-weight text. Body rows alternate with transparent backgrounds and highlight on hover. Cell content uses body-sm typography with 0.5rem padding. Tables are contained within their parent card border. The optional vertical-ledger class adds 0.5px column separators for data-heavy ledgers.

### Inputs

Interactive height of 2rem with 4px border radius. Default state uses a transparent background with a warm outline border. Focus state uses a 1px primary ring. Placeholder text uses muted foreground. Error state uses a destructive border.

### Badges

Small 1.25rem status indicators with 4px border radius and 0.125rem vertical padding. Default variant uses a black fill with white text. Destructive variant uses warm red background. The sharp corners provide a calligraphic edge that contrasts with the rounded containers.

## Do's and Don'ts

### Structural chrome

- **Do** use the warm paper token system (primary, secondary, muted, etc.) for all UI chrome.
- **Don't** introduce cool grays or blue-toned colors into structural elements.
- **Do** use thin borders (`border-border/30`) on cards instead of ring outlines.

### Colors

- **Do** reserve jade for positive financial values and cinnabar for negative.
- **Don't** use jade or cinnabar for decorative purposes or structural chrome.
- **Don't** introduce additional accent colors beyond jade and cinnabar.

### Cards

- **Do** use `border border-border/30` as the standard card border.
- **Do** use `rounded-xl` (12px) for all card containers.
- **Don't** use drop shadows on cards — tonal layering with borders is sufficient.

### Typography

- **Do** use tabular numerals for all monetary values, percentages, and dates.
- **Do** use tight tracking on headings, wide tracking on uppercase labels.
- **Don't** combine tight and wide tracking on the same text element.

### Layout

- **Do** use the fixed-sidebar + scrollable-content pattern with `h-screen overflow-hidden`.
- **Do** keep the TopHeader sticky within the scrollable column with `shrink-0`.
- **Don't** make the entire page scroll — only the right content column should scroll.

### Dark mode

- **Do** provide full dark mode support using the warm-night-ink tokens.
- **Don't** assume light mode border opacities work in dark mode — borders should be translucent overlays.

### Animation

- **Do** use 200ms for interactive transitions, 100ms for dialog open/close, 500ms for data-driven animations.
- **Don't** exceed 500ms for any animation.

### Accessibility

- **Do** maintain 4.5:1 contrast for body text in both modes.
- **Do** provide focus rings on all interactive elements using the ring token.
- **Don't** rely solely on color to convey financial meaning — pair jade/cinnabar with +/- signs.
