# 04: WAI-ARIA APG Primitive Normalization (Button & Input)

**What to build:** Fully standardized, accessible button and input primitives that eliminate state machine workarounds, ensuring buttons behave as standard APG action buttons unless toggled, and inputs automatically propagate error and helper description identifiers to assistive technologies.

**Blocked by:** 01: Prefactoring and Gate Sensor Rectification

**Status:** ready-for-agent

- [ ] Button primitive behaves as a standard HTML `<button>` by default with proper keyboard and activation semantics, only binding toggle state machine attributes when an explicit toggle property is provided.
- [ ] Input primitive manages validation and interaction states (`invalid`, `disabled`, `readOnly`), automatically composing `aria-invalid` and `aria-describedby` to associate helper text and error message element IDs.
- [ ] Styled UI components wrapping Button and Input reflect the updated attributes and states cleanly via token styles.
- [ ] Component stories and documentation fixtures demonstrate default, toggle, invalid, and disabled states.
- [ ] Automated accessibility audits via axe-core achieve zero WCAG 2.2 AA violations, and APG keyboard navigation tests pass cleanly.
