# Token & Component CSS API (frozen cross-package contract)

This file is the interoperability contract between `engine`, `tokens`, `primitives`, `ui`,
`contracts`, `registry`, `mcp-server`, `cli` and `apps/showcase`. Names below are **frozen**:
consuming packages must not invent alternatives.

## 1. Data flow (strictly one-way)

```
DESIGN.md (Intent SSOT, hand-authored, hex colours per DESIGN.md spec)
   └─(A) @google/design.md lint            → Tier-2 gate, errors must be 0
   └─(B) @google/design.md export --format dtcg
          → primitive tier                → packages/tokens/tokens.json (Artifact SSOT, GENERATED ONLY)
   └─(C) engine synthesises semantic + component tiers on top of the primitives
   └─(D) Style Dictionary v5.7            → dist/css/*.css, tailwind/theme.css, dist/json, dist/js types
```

`tokens.json` is machine-generated. Hand-editing it is a gate failure; the build must be
idempotent (rebuild → byte-identical output).

## 2. DTCG 2025.10 artifact layout (`packages/tokens/tokens.json`)

```
color.primitive.<name>            // every DESIGN.md colour, converted to oklch(...)
color.primitive.dark.<name>
color.primitive.hc.<name>  /  color.primitive.hcDark.<name>
color.semantic.<role>             // $value is an alias "{color.primitive.x}"
color.semantic.dark.<role>
color.semantic.highContrast.<role>
color.semantic.highContrastDark.<role>
color.component.<component>.<part>
space.<scale>                     dimension
radius.<scale>                    dimension
border.width.<name>               dimension
font.family.<name>                fontFamily
font.size.<name>                  dimension
font.weight.<name>                number
font.lineHeight.<name>            number
font.letterSpacing.<name>         dimension
duration.<name>                   duration ("150ms")
easing.<name>                     cubicBezier
elevation.<level>                 shadow
control.height.<size>             dimension
target.size.min                   dimension
```

Rules: `$`-prefixed reserved members only (`$value`, `$type`, `$description`, `$extensions`),
alias syntax `"{group.path.token}"`, `$extensions["designharness"]` carries
`{ tier: "primitive"|"semantic"|"component", mode: "light"|"dark"|"high-contrast" }`.
DTCG `$type` values used: `color`, `dimension`, `number`, `duration`, `cubicBezier`, `shadow`,
`fontFamily`.

## 3. CSS custom property names (what `ui` and `showcase` may consume)

`$tier`-stripped path, joined with `-`, prefixed by the top-level group. The semantic tier is
the public API; primitives are exposed too (needed by the `[data-theme]` cascade).

- **Surfaces** `--color-canvas` `--color-surface` `--color-surface-sunken` `--color-surface-raised`
  `--color-scrim` `--color-overlay`
- **Text** `--color-text-primary` `--color-text-secondary` `--color-text-inverse`
- **Interaction** `--color-primary` `--color-primary-hover` `--color-primary-pressed`
  `--color-primary-subtle` `--color-on-primary` `--color-on-primary-subtle`
- **Borders / focus** `--color-border-subtle` `--color-border-strong` `--color-border-selected`
  `--color-focus`
- **States** `--color-success` `--color-success-subtle` `--color-on-success-subtle`
  `--color-warning` `--color-warning-subtle` `--color-on-warning-subtle`
  `--color-danger` `--color-danger-subtle` `--color-on-danger` `--color-on-danger-subtle`
- **Space** `--space-xxs` `--space-xs` `--space-sm` `--space-md` `--space-lg` `--space-xl`
  `--space-xxl` `--space-xxxl` `--space-base` (0.25rem scalar)
- **Radius** `--radius-xs` `--radius-sm` `--radius-md` `--radius-lg` `--radius-xl` `--radius-full`
- **Type** `--font-family-body` `--font-family-display` `--font-family-mono`
  `--font-size-display-lg` `--font-size-heading-1` `--font-size-heading-2` `--font-size-heading-3`
  `--font-size-body-lg` `--font-size-body-md` `--font-size-body-sm` `--font-size-label-caps`
  `--font-size-numeric-md` `--font-size-numeric-lg`
  `--font-weight-*` `--line-height-*` `--letter-spacing-*` (same leaf names as `--font-size-*`)
- **Border widths** `--border-width-hairline` (0.0625rem) `--border-width-strong` (0.125rem)
- **Motion** `--duration-instant` `--duration-fast` `--duration-moderate` `--duration-slow`
  `--easing-standard` `--easing-exit` `--easing-entry`
- **Elevation** `--elevation-0` `--elevation-1` `--elevation-2`
- **Controls** `--control-height-sm` `--control-height-md` `--control-height-lg`
  `--target-size-min`
- **Component tier** `--button-height` `--button-padding-inline` `--button-radius`
  `--input-height` `--input-padding-inline` `--dialog-radius` `--dialog-padding`
  `--dialog-max-width-sm` `--dialog-max-width-md` `--dialog-max-width-lg`
  `--table-header-height` `--table-row-height-standard` `--table-row-height-compact`
  `--table-row-height-comfortable` `--table-cell-padding-inline`

Cascade, in the generated CSS (never hand-authored):

```css
:root, [data-theme="light"] { color-scheme: light; /* semantic light */ }
[data-theme="dark"] { color-scheme: dark; /* semantic dark */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* semantic dark */ } }
[data-theme="high-contrast"] { /* semantic highContrast */ }
[data-theme="high-contrast-dark"] { /* semantic highContrastDark */ }
```

## 4. Package exports

| Package | Import specifier | Contents |
| :--- | :--- | :--- |
| `@designharness/tokens` | `@designharness/tokens/css` | `dist/css/index.css` (all modes + cascade) |
| | `@designharness/tokens/css/light` / `dark` / `high-contrast` | single mode |
| | `@designharness/tokens/tailwind` | `tailwind/theme.css` with `@theme` |
| | `@designharness/tokens/tokens.json` | DTCG artifact |
| | `@designharness/tokens/json` | resolved flat JSON |
| | `@designharness/tokens/recipe` | `tokens` + `semanticRoles` TS constants and literal types |
| `@designharness/primitives` | `@designharness/primitives` | headless anatomy components + Zag connectors |
| `@designharness/ui` | `@designharness/ui` | `Button` `Input` `Combobox` `Dialog` `DataTable` (+ stories) |
| | `@designharness/ui/styles.css` | token-only component CSS |
| `@designharness/contracts` | `@designharness/contracts` | `createMockHandlers()` `setupMockServer()` types + zod guards |
| | `@designharness/contracts/openapi/data-table.json` | OpenAPI 3.1 fragment |
| `@designharness/mcp` | server binary `designharness-mcp` | `list_components`, `query_token` |
| `designharness` | CLI binary `designharness` | build / lint / metadata / registry / mcp / gates |

## 5. Component CSS + anatomy conventions

- Headless primitives emit Zag attributes on every part: `data-scope="<component>"`,
  `data-part="<part>"`, plus machine-provided `aria-*`/`id`/`tabindex`. Parts per component:
  - `button`: `root`
  - `input`: `root` `label` `input` `description` `errorText`
  - `combobox`: `root` `label` `control` `trigger` `input` `clear` `positioner` `content` `list` `option`
  - `dialog`: `root` `trigger` `backdrop` `positioner` `content` `header` `title` `body` `closeTrigger`
  - `table`: `root` `toolbar` `searchField` `table` `head` `row` `columnheader` `rowheader` `cell`
    `select` `pagination` `paginationPageText` `prevTrigger` `nextTrigger` `status` `emptyState`
- Styled layer uses BEM-ish classes `dh-<component>`, `dh-<component>--<variant>`,
  `dh-<component>[data-part="<part>"]` selectors. Selectivity must stay at or below
  `(0,2,0)`; `!important` is banned by the Stylelint sensor.
- Every authored CSS declaration must reference tokens — `harness/prefer-token-reference`,
  `harness/no-hardcoded-color`, `harness/no-hardcoded-length` and `harness/no-important` all run.
- Minimum interactive target: `--control-height-md` (2.25rem = 36px) ≥ WCAG 2.2 SC 2.5.8.
- Motion: `transition: <prop> var(--duration-fast) var(--easing-standard)` and a global
  `@media (prefers-reduced-motion: reduce)` block that neutralises transform/keyframe motion.

## 6. Naming for downstream tooling

- Component ids (registry, MCP, metadata): `button` `input` `combobox` `dialog` `data-table`.
- Registry item names match ids; registry type `registry:component`, base style item
  `meridian-base` of type `registry:base` carrying the token CSS.
- Prop metadata file: `packages/contracts/generated/component-metadata.json`
  (keyed by component id, `props[]` with `name type required default description`).
- Stories are CSF 3.0: `*.stories.tsx` with `meta` (`title` `component` `tags:['autodocs']`)
  and `satisfies StoryObj` named exports, states `Default` `Secondary` `Disabled` `Loading`
  `WithError` `Dark` as applicable.
