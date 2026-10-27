/**
 * `inert` synchronisation for Zag 1.46 modal dialogs.
 *
 * Zag's dialog machine hides the background of a modal dialog with `aria-hidden` (marking the
 * elements it touched with `data-aria-hidden`) — but `aria-hidden` alone leaves the background
 * fully focusable, which is both a real keyboard trap-adjacent defect (a Tab press can land
 * focus inside content a screen reader has been told does not exist) and an axe-core
 * `aria-hidden-focus` violation under WCAG 2.2 SC 4.1.2.
 *
 * The ARIA Authoring Practices answer is to make the inert content non-focusable as well, so
 * this mirrors Zag's markers onto the `inert` attribute for exactly as long as the dialog is
 * open, and hands the elements back afterwards. It is deliberately a *mirror* of the machine's
 * own state rather than a second source of truth: nothing here hides or reveals anything that
 * the machine did not already decide.
 */

/** Zag's own marker for "I applied aria-hidden to this element". */
const HIDDEN_MARKER = '[data-aria-hidden]';

/** The subtree a modal must never make inert: its own dialog surface. */
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

function inertCandidates(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HIDDEN_MARKER)).filter(
    (element) => element.closest(DIALOG_SELECTOR) === null,
  );
}

/**
 * Applies `inert` to everything the machine has hidden, keeps doing so while the DOM changes,
 * and returns a disposer that hands the attribute back to exactly those elements.
 *
 * `body` is observed rather than a subtree because Zag marks top-level siblings of the dialog
 * (page chrome, and the trigger that opened it), which live directly under `body`.
 */
export function syncInertWithAriaHidden(): () => void {
  if (typeof document === 'undefined') return () => {};

  const marked = new Set<HTMLElement>();
  const apply = (): void => {
    for (const element of inertCandidates(document.body)) {
      if (element.hasAttribute('inert')) continue;
      element.setAttribute('inert', '');
      marked.add(element);
    }
  };

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-aria-hidden', 'aria-hidden'],
  });

  return () => {
    observer.disconnect();
    for (const element of marked) element.removeAttribute('inert');
    marked.clear();
    // Elements that appeared between the last mutation and the close are caught here too.
    for (const element of inertCandidates(document.body)) element.removeAttribute('inert');
  };
}

/** True when `element` carries the marker Zag uses for machine-hidden background content. */
export function isMachineHidden(element: Element): boolean {
  return element.hasAttribute('data-aria-hidden');
}
