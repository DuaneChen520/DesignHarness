# Project Persistence and Phased Implementation Rollout

To support friction-free revisits and safe delivery, we decided to persist Target Project bindings in local storage with a top navigation switcher, and execute the rollout in four sequential phases: Skill intent layer, Vite API middleware, Cockpit dashboard UI, and downstream verification on `carweb`.

## Status

Accepted

## Considered Options

- Stateless query-string-only binding: Rejected because losing the URL parameter resets context and forces manual path re-entry.
- Big-bang single PR rollout: Rejected due to risk of regressions across monorepo build, showcase tests, and engine types.

## Consequences

- The Cockpit frontend manages a `recentProjects` list with a current active project selector.
- Implementation proceeds strictly in four verifiable stages with gate tests at each tier.
