# 03: Type-Safe TanStack Query Hooks for Component Contracts

**What to build:** Ready-to-use, type-safe TanStack Query hooks exported from the contracts package, allowing consumer applications to wire up data-driven UI components (like DataTable and Combobox) with caching, pagination, sorting, and search filtering without writing custom data-fetching boilerplate.

**Blocked by:** 01: Prefactoring and Gate Sensor Rectification

**Status:** ready-for-agent

- [ ] The contracts package declares `@tanstack/react-query` as a peer and development dependency.
- [ ] A dedicated table query hook (`useDataTableQuery`) is exported, accepting parameters corresponding to OpenAPI table operation parameters and managing pagination, column sorting, and text query filtering.
- [ ] A dedicated combobox search hook (`useComboboxSearchQuery`) is exported, managing asynchronous option searches with query key serialization.
- [ ] Query keys are deterministically structured and namespaced by OpenAPI operation IDs.
- [ ] Automated integration tests verify that the query hooks dispatch expected HTTP requests and resolve valid responses when intercepted by MSW mock handlers.
