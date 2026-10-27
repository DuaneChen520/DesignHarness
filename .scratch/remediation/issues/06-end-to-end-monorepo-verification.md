# 06: End-to-End Monorepo Integration & Verification Gate

**What to build:** A comprehensive release verification pass across the entire monorepo, executing full builds, cross-package unit tests, and all four tiers of quality sensors to confirm that all remediation items have successfully landed and passed with zero regressions.

**Blocked by:** 02: Multi-Platform Token Compilation Pipeline (SCSS, Compose, Swift), 03: Type-Safe TanStack Query Hooks for Component Contracts, 04: WAI-ARIA APG Primitive Normalization (Button & Input), 05: Architectural SSOT and ADR Documentation Calibration

**Status:** ready-for-agent

- [ ] Full monorepo build (`pnpm build`) succeeds across all 10 packages without warnings or stale caches.
- [ ] Monorepo unit and integration test suite (`pnpm test`) passes 100% across all packages.
- [ ] Tier 1 pre-commit AST sensor (`pnpm gate:tier1`) passes with zero forbidden color or pixel literals.
- [ ] Tier 2 intent and drift sensor (`pnpm gate:tier2`) reports zero errors against the canonical intent document.
- [ ] Tier 3 type checking and axe-core accessibility sensor (`pnpm gate:tier3`) confirms clean TypeScript types and zero WCAG 2.2 AA violations.
- [ ] Tier 4 release visual and contract regression suite (`pnpm gate:tier4`) passes with zero visual diffs and green contract round-trips.
- [ ] Unified verification runner (`pnpm verify`) prints a 100% green summary report.
