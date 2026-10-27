# 01: Prefactoring and Gate Sensor Rectification

**What to build:** A reliable quality sensor and codebase hygiene baseline where Tier 3 CI sensors permit all supported Node.js 24 releases without false alarms, hook dependencies are cleanly stabilized without linter suppressions, shared utility functions are de-duplicated across packages, and standard Changesets configuration is initialized for monorepo release management.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Tier 3 verification sensor correctly permits all Node.js 24 versions (`^24`), ensuring environments running on Node 24.0.0 through 24.10.x pass the pre-flight check cleanly.
- [ ] Table primitive components stabilize memoized callback dependencies, eliminating all unannotated `react-hooks/exhaustive-deps` suppression comments.
- [ ] Shared utility functions (such as content presence verification, cryptographic hashing, and table query models) are consolidated into shared internal utilities rather than duplicated across packages.
- [ ] Standard Changesets configuration (`.changeset/config.json`) is initialized with linked monorepo package rules and GitHub changelog format.
- [ ] Running pre-commit and standard gates (`pnpm gate:tier1` and `pnpm gate:tier3`) completes with zero errors and zero warnings.
