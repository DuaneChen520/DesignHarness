# Design System Harness Remediation & Enhancement Specification

**Status**: Ready for Agent (`ready-for-agent`)  
**Context**: Result of `/code-review` findings, primary source benchmark against `RESEARCH.md`, and `/grill-me` design tree alignment.

---

## Problem Statement

While the initial implementation of the Design System Harness successfully established the core monorepo pipeline and passed basic automated tiered gates, the comprehensive review revealed several functional gaps and architectural inconsistencies against the original specification:

1. **Restricted Token Export Formats**: Token compilation is limited to modern web targets (CSS custom properties, Tailwind v4 theme, JSON/TS dictionaries), lacking the promised mobile native (Android Jetpack Compose, iOS SwiftUI) and preprocessor (SCSS) export platforms required by cross-platform design system consumers.
2. **Missing Asynchronous State Management Hooks**: Applications consuming the harness must manually assemble data-fetching state and caching logic around raw contract endpoints and MSW request handlers, lacking standardized React Query hooks for contract-driven components.
3. **Primitive Component Semantic Compromises**: Certain primitive components rely on semantic workarounds (such as Button depending on a toggle state machine rather than standard action button semantics) and lack integrated accessible descriptor linkage for form validation.
4. **Sensor Versioning Flaw & Linter Escapes**: The quality sensor pipeline contains a version detection defect that mistakenly rejects valid Node.js 24 releases, alongside unaddressed hook dependency suppression comments and copy-pasted utility helpers across packages.
5. **Specification Documentation Mismatch**: The specification documentation claims compliance with standards that do not match the real React architecture (such as claiming Web Components CEM instead of structured React props AST metadata, and claiming full Ark UI anatomical component wrappers while actually binding directly to Zag.js state machines).

---

## Solution

A comprehensive remediation and enhancement that achieves complete fidelity with the updated design system harness architecture:

1. **Multi-Platform Token Delivery**: Extend the token compilation engine to produce first-class Android Jetpack Compose (`Color.kt`), iOS SwiftUI (`ColorAsset.swift`), and SCSS flat-map variables alongside existing web targets.
2. **Type-Safe Contract Query Hooks**: Ship standard, type-safe TanStack Query hooks directly from the contract package, enabling one-line consumption of OpenAPI-backed, MSW-intercepted components.
3. **Normalized Primitives**: Refactor primitives to eliminate state machine hacks, ensuring clean WAI-ARIA APG button and input primitives.
4. **Sensor & Standards Rectification**: Fix the tiered gate sensor logic for Node.js 24, initialize standard Changesets versioning configuration, remove hook suppression escapes, and de-duplicate utility helpers.
5. **Calibrated Architectural SSOT**: Calibrate architectural documentation (ADRs) to record direct Zag.js FSM usage and React props metadata, eliminating false claims while cementing the 4-layer physical topology.

---

## User Stories

1. As a mobile Android engineer, I want token compilation to output an idiomatic Kotlin Compose `Color.kt` object, so that I can directly consume the design system's OKLCH and semantic color palette in native Android apps without manual translation.
2. As a mobile iOS engineer, I want token compilation to output an idiomatic Swift `ColorAsset.swift` extension, so that I can directly style SwiftUI views using the design system's color and elevation definitions.
3. As a legacy web developer, I want token compilation to export an SCSS map and variables file, so that I can consume design tokens in existing Sass/SCSS stylesheets without depending on modern CSS custom properties.
4. As a web application developer, I want ready-to-use TanStack Query hooks generated alongside OpenAPI contracts and MSW handlers, so that I can integrate data-driven components (like DataTable and Combobox) with caching, pagination, and sorting without writing custom data fetching wrappers.
5. As a frontend engineer, I want button primitives to exhibit standard APG button behaviors without internal toggle state machine side-effects, so that buttons behave predictably unless explicitly configured as toggles.
6. As a screen reader user, I want input primitives to properly bind `aria-invalid` and `aria-describedby` to error messages and helper descriptions, so that assistive technologies announce validation state changes automatically.
7. As a CI/CD engineer, I want the tiered verification sensors to correctly identify and permit all Node 24 runtime environments, so that builds do not fail erroneously on Node 24.0 through 24.10 releases.
8. As a design system maintainer, I want a standard Changesets configuration, so that package releases, changelog generation, and SemVer version increments can be automated across the monorepo.
9. As a codebase contributor, I want common utility functions (such as content presence checks and cryptographic hashing) shared through internal modules, so that logic is not duplicated across packages.
10. As an AI agent or automated developer tool, I want accurate component props metadata describing React props, default values, and JSDoc comments without artificial Web Components CEM fields, so that prompts and code generators receive true type definitions.
11. As an engineering manager, I want the repository documentation and architecture records to reflect the true decoupled 4-layer topology and direct Zag.js state machine implementation, so that team members and auditors see an honest, zero-hallucination architectural reference.

---

## Implementation Decisions

### 1. Multi-Platform Token Exporter Engine
- Expand the Style Dictionary configuration within the engine to define three new export platforms: `scss`, `compose`, and `swift`.
- The SCSS platform formats token objects into flat `$color-*` variables and a structured SCSS map containing all color, dimension, and duration tokens.
- The Compose platform formats OKLCH/sRGB colors into a Kotlin singleton object `Color` under the package `com.designharness.tokens`, using `androidx.compose.ui.graphics.Color(0xFF...)` syntax.
- The Swift platform formats color tokens into a `SwiftUI.Color` extension with public static properties matching the semantic and primitive tokens.
- Output artifacts are generated into dedicated subdirectories within the tokens distribution: `dist/scss/`, `dist/compose/`, and `dist/swift/`.

### 2. TanStack Query Hooks Module
- Introduce `@tanstack/react-query` as a peer dependency and dev dependency in the contracts package.
- Provide query hook factories that consume the existing contract HTTP client and accept query parameters matching OpenAPI operation parameter definitions.
- Export standard hooks for asynchronous components:
  - `useDataTableQuery`: Manages table pagination, column sorting, and text query filtering with automatic query key serialization.
  - `useComboboxSearchQuery`: Manages asynchronous option search with debouncing support.
- Ensure all query hooks seamlessly resolve against running MSW mock handlers in test and development modes.

### 3. Primitive Component Normalization
- Standardize the button primitive:
  - Default action mode relies on native `<button>` attributes and APG-compliant keyboard interaction.
  - Toggle mode (`toggle: true`) conditionally activates the Zag.js toggle machine, binding `aria-pressed` and `data-state`.
- Standardize the input primitive:
  - Add explicit state properties for `invalid`, `disabled`, and `readOnly`.
  - Provide automatic `aria-invalid` propagation and `aria-describedby` composition linking error message IDs and description element IDs.

### 4. Quality Sensors & Hygiene Rectification
- Correct the version checking predicate in the standard gate sensor to accept all Node 24 versions: `major >= 26 || major === 24 || (major === 22 && minor >= 11)`.
- Refactor the table primitive's memoized callbacks to stabilize internal references, eliminating the unannotated `react-hooks/exhaustive-deps` suppression comment.
- Extract common helper functions (`isPresent`, `sha256`, and query type aliases) into shared internal utilities rather than repeating declarations.
- Initialize `.changeset/config.json` with standard monorepo configuration:
  - Linked packages configuration for synchronized versions across the harness.
  - Public access level and GitHub repository commit metadata formatting.

### 5. Architectural SSOT & Documentation Calibration
- Update `RESEARCH.md` and `README.md` to:
  - Formalize the architectural decision record (ADR) establishing direct Zag.js FSM binding over multi-layer wrapper abstractions.
  - Document the 4-layer decoupled physical topology (`packages/primitives`, `packages/ui`, `packages/contracts`, `apps/showcase`).
  - Formalize the algorithmic semantic token derivation engine as the core translation layer between `DESIGN.md` intent and DTCG artifacts.
  - Calibrate the component metadata specification to document React Props AST (`component-metadata.json`) rather than Web Components CEM.

---

## Testing Decisions

- **Testing Philosophy**: Test observable external behaviors, schemas, and outputs; avoid testing private implementation details.
- **Seams Tested**:
  1. *Token Multi-Platform Seam*: Vitest tests verifying that `dist/scss/_tokens.scss`, `dist/compose/Color.kt`, and `dist/swift/ColorAsset.swift` exist, parse cleanly, and match the source DTCG color values.
  2. *Contract Query Seam*: Vitest tests using MSW request interception to verify that `useDataTableQuery` and `useComboboxSearchQuery` correctly serialize request parameters and deliver parsed response models.
  3. *Primitive Accessibility Seam*: Playwright and axe-core tests validating that normalized button and input components achieve zero WCAG 2.2 AA violations and pass keyboard APG interaction specs.
  4. *Tiered Sensor Seam*: Full execution of `pnpm verify` (Tiers 1 through 4) to ensure AST rules, intent drift, TypeScript types, accessibility gates, and release visual regression tests remain 100% green.

---

## Out of Scope

- Native mobile UI component rendering libraries (e.g. Android Jetpack Compose UI composables or iOS SwiftUI view components; only design tokens are exported for mobile).
- Server-Driven UI (SDUI) dynamic layout engines or Mitosis multi-framework JSX cross-compilation (deferred to v2 roadmap).
- Custom Elements Manifest (CEM) generation (rejected in favor of authentic React Props AST metadata).
- APCA contrast ratio enforcement as a blocking merge gate (retained strictly as a diagnostic advisory).

---

## Further Notes

- Every parameter, threshold, and file format adheres strictly to the zero-hallucination constraint and is validated against primary upstream specifications.
