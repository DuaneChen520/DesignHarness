---
version: alpha
name: Meridian
description: Meridian is the design system for data-dense financial operations consoles, where operators read numeric truth under time pressure.
colors:
  # --- light surface system ---
  canvas: "#FAFAFB"
  surface: "#FFFFFF"
  surface-sunken: "#F1F2F4"
  surface-raised: "#FFFFFF"
  overlay: "#0B0F16"
  # --- light ink + interaction ---
  primary: "#1A5FD0"
  primary-hover: "#154EA6"
  primary-pressed: "#0F3D80"
  primary-subtle: "#EAF1FD"
  on-primary: "#FFFFFF"
  text-primary: "#14171C"
  text-secondary: "#4A5160"
  text-on-dark: "#EDEFF3"
  border-subtle: "#D9DCE3"
  border-strong: "#6B7683"
  focus-ring: "#1A5FD0"
  # --- light semantic states ---
  success: "#127A4A"
  success-subtle: "#DCEFE6"
  on-success-subtle: "#0B4A2C"
  warning: "#8A5200"
  warning-subtle: "#FBEBD2"
  on-warning-subtle: "#4A2C00"
  danger: "#B42318"
  on-danger: "#FFFFFF"
  danger-subtle: "#FBE3E1"
  on-danger-subtle: "#611512"
  # --- dark surface system ---
  canvas-dark: "#0F1115"
  surface-dark: "#171A20"
  surface-sunken-dark: "#0A0C0F"
  text-primary-dark: "#EDEFF3"
  text-secondary-dark: "#A5AEBD"
  border-subtle-dark: "#2A313C"
  border-strong-dark: "#6E7A8B"
  primary-dark: "#7FB0FF"
  primary-subtle-dark: "#182638"
  on-primary-dark: "#08192E"
  success-dark: "#4ADE9B"
  warning-dark: "#F0B429"
  danger-dark: "#FF7B72"
  # --- high contrast (light) ---
  hc-canvas: "#FFFFFF"
  hc-surface: "#FFFFFF"
  hc-text: "#000000"
  hc-border: "#000000"
  hc-primary: "#0B3F8C"
  hc-on-primary: "#FFFFFF"
  # --- high contrast (dark) ---
  hc-canvas-dark: "#000000"
  hc-surface-dark: "#000000"
  hc-text-dark: "#FFFFFF"
  hc-border-dark: "#FFFFFF"
  hc-primary-dark: "#9EC9FF"
  hc-on-primary-dark: "#000000"
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  heading-1:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.015em
  heading-2:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: -0.01em
  heading-3:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  body-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.06em
  numeric-md:
    fontFamily: JetBrains Mono
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: tnum
  numeric-lg:
    fontFamily: JetBrains Mono
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: tnum
rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-active:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 12px
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.md}"
    height: 36px
  button-icon:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    size: 36px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 12px
  input-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
  combobox:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    height: 36px
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-caps}"
    padding: 12px
    height: 40px
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
  badge-success:
    backgroundColor: "{colors.success-subtle}"
    textColor: "{colors.on-success-subtle}"
    rounded: "{rounded.full}"
    padding: 4px
  badge-warning:
    backgroundColor: "{colors.warning-subtle}"
    textColor: "{colors.on-warning-subtle}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "{colors.danger-subtle}"
    textColor: "{colors.on-danger-subtle}"
    rounded: "{rounded.full}"
  link:
    textColor: "{colors.primary}"
---

## Overview

Meridian is an **instrument panel**, not a billboard. It exists so a risk or
operations operator can read a wall of numbers, find the one that is wrong, and
act on it without ever guessing what a colour means.

Creative North Star: **"Legible at a glance, honest under pressure."**

Three principles govern every decision below.

1. **Numeric truth first.** Figures are the product. They are set in a tabular
   monospace face, right-aligned, and never decorated in a way that makes two
   different values look the same.
2. **Colour is a state, never an ornament.** Green/amber/red mean
   healthy/at-risk/breached across every surface, chart, badge and border. If a
   pixel is not carrying meaning, it is neutral grey.
3. **Calm density.** Interfaces are dense, but never cramped. Breathing room
   comes from the 8px rhythm and container-driven layout, not from shrinking type.

The visual register is cool, clean and modern: matte neutrals, one blue
interaction accent, hairline separators, and motion that is barely there.

## Colors

The palette is a neutral cool-grey foundation carrying a single interactive
blue, plus three fixed-state hues.

- **Primary (`#1A5FD0`):** the only colour that means "you can act on this".
  It is deliberately dark enough that white text on it clears WCAG 2.2 AA
  (5.83:1) at body size, so buttons never need a special accessible-text colour.
- **Text primary (`#14171C`) / secondary (`#4A5160`):** secondary grey is not
  "de-emphasised to invisibility"; it still clears 4.5:1 on every surface it is
  used against. Muted-but-illegible text is a bug, not a style.
- **Border strong (`#6B7683`):** every control boundary that a user must
  perceive — input outline, focusable region, checkbox edge — meets the WCAG
  2.2 SC 1.4.11 3:1 non-text threshold against `surface`.
- **Border subtle (`#D9DCE3`):** decorative dividers only (table row rules,
  card seams). Never the only signal that a control exists.
- **Semantic states:** `success`, `warning`, `danger` are text-and-icon
  colours; each ships with a `-subtle` background and an `on-*-subtle` ink so
  badges stay AA-compliant as a pair, not as two independent tokens.

Dark mode is a **re-composition, not an inversion**. Surfaces go cool-black,
inks go off-white (`#EDEFF3`, never pure white on black — it halates), and the
accent lightens to `#7FB0FF` because a 5.8:1-on-white blue is only ~2:1 on a
dark canvas. High contrast mode discards all subtlety: pure black/white
surfaces and 3:1+ borders, with the accent pulled to `#0B3F8C`.

Contrast is the **only rigid gate** (WCAG 2.2). APCA `Lc` is computed and
reported for diagnostics — useful for large-type legibility — but it is not a
standard and never blocks a release.

## Typography

Inter for prose and labels; **JetBrains Mono with `tnum`** for every number
that a user might compare across rows. Tabular figures are the single biggest
legibility win in a data UI: columns of digits align without the reader
re-tracking each glyph.

- Display/headings use tight negative tracking (`-0.02em`) and short line
  heights; body copy uses 1.6 for long-form reading in docs and tooltips.
- `label-caps` (0.75rem, 600 weight, +0.06em tracking) is the only uppercase
  style, reserved for table headers, form labels and metric captions.
- Fluid sizing: body text scales with `clamp(1rem, 0.92rem + 0.4cqi, 1.125rem)`
  so a card placed in a 300px rail and one placed in an 800px stage both stay
  readable without breakpoint jumps.
- Minimum rendered size is 0.75rem. If it needs to be smaller than that, it
  should be removed, not shrunk.

## Layout

Built on a **4px half-grid / 8px base grid**: `xxs 4 → xs 8 → sm 12 → md 16 →
lg 24 → xl 32 → xxl 48 → xxxl 64`. Any spacing value in the system is a
multiple of 4; anything that is not, is a mistake.

Components adapt to **their own width, not the viewport width**. Use container
queries (`@container (min-width: 40rem)`) for card, table and filter layouts so
the same component self-arranges in a 300px sidebar or an 800px main stage.
Media queries are reserved for page-shell concerns only (navigation collapse,
viewport-level padding).

Content max-width for prose is 72ch. Table density has exactly three sanctioned
levels (compact 32px, standard 40px, comfortable 56px rows) — do not invent a
fourth.

## Elevation & Depth

Three elevations, and no more.

1. **Flat (`elevation-0`)** — canvas and sunken surfaces. Separated by hairline
   borders.
2. **Raised (`elevation-1`)** — cards, sticky table headers, menus. A tight,
   low-alpha shadow with a hairline border so the edge still reads on dark
   surfaces where shadows are invisible.
3. **Overlay (`elevation-2`)** — dialogs, popovers, command palette. A wider
   shadow plus a scrim (`overlay` at reduced alpha). Because a shadow carries no
   meaning in dark mode, every raised and overlay surface must *also* declare a
   border token. Elevation is never communicated by shadow alone.

## Shapes

Radii are structural, not decorative: `xs 2` for inline chips, `sm 4` for inputs
and menu items, `md 8` for buttons and cards, `lg 12` for dialogs, `xl 16` for
large panels, `full` for badges and avatars. Concentric nesting increases the
radius by one step per layer (an 8px card holds 4px children). Nothing is
pill-shaped unless it is a badge or a toggle.

## Components

- **Button** — minimum hit area 36×36px, comfortably above the WCAG 2.2 SC
  2.5.8 24px minimum. Loading state sets `aria-busy` and keeps the previous
  label width so the surrounding layout does not jump. Icon-only buttons
  require an accessible name and reveal a tooltip on hover/focus.
- **Input** — label is always visible (never placeholder-only), with the
  placeholder reserved for examples, not instructions. Error text is linked via
  `aria-describedby` and paired with an icon plus wording; colour alone is
  never the error signal.
- **Combobox** — follows the ARIA APG combobox pattern: `ArrowDown`/`ArrowUp`
  move the active option, `Home`/`End` jump to first/last, `Enter` commits,
  `Escape` closes and restores the typed value, and the input keeps focus while
  the listbox stays `aria-expanded`.
- **Dialog** — focus moves into the dialog on open, is trapped while open, and
  returns to the trigger on close. `Escape` closes non-destructive dialogs.
  Backdrop clicks close, but a dialog containing an unrecoverable action does
  not.
- **DataTable** — sortable column headers are real buttons exposing
  `aria-sort`; row selection is a checkbox column with a `Select all` header
  control; the pager is a labelled navigation region. Numeric cells are
  right-aligned `numeric-md`. Sticky headers keep their border so column
  identity survives scrolling.

## Do's and Don'ts

**Do**

- Consume tokens. Every colour, space, radius and duration in code is a
  `var(--…)` that came from the compiled token artifact.
- Keep semantic roles stable across modes: `text-secondary` means the same
  thing in dark mode as in light mode, even though its value differs.
- Give every state a visible, non-colour cue (icon, weight, underline, text).
- Test keyboard-only flows: Tab, Shift+Tab, Arrow keys, Home/End, Escape,
  Enter, Space.
- Truncate with a real tooltip, and let numbers keep their precision.

**Don't**

- No hardcoded hex, `rgb()`, `hsl()`, or named colours in component code — the
  Stylelint gate blocks the commit.
- No raw pixel values for spacing or type — use the spacing scale or relative
  units.
- No `!important`, no inline one-off overrides, no fourth elevation level.
- Do not use red/green as the only differentiator — the palette assumes some
  reader cannot see it.
- No gradients, blur-backdrops or large-area shadows for decoration; they cost
  frame time and blur the state hierarchy.
- Do not animate layout properties or ignore
  `prefers-reduced-motion: reduce` — motion degrades to an instant opacity
  change (WCAG 2.2 SC 2.3.3).
- Never shrink a hit target below 24×24px, and never put two interactive
  targets closer than 8px apart.
