import { createAnatomy } from '@zag-js/anatomy';

/**
 * Anatomy definitions for the primitives that are not driven by a stock Zag machine,
 * plus the combobox parts that are renamed to match the frozen cross-package contract
 * in `packages/tokens/TOKEN-API.md` §5 (`item` -> `option`, `clearTrigger` -> `clear`).
 *
 * Every part emits `data-scope="<component>"` + `data-part="<part>"` only — no styles.
 */
export const buttonAnatomy = createAnatomy('button')
  .parts('root')
  .build();

export const inputAnatomy = createAnatomy('input')
  .parts('root', 'label', 'input', 'description', 'errorText')
  .build();

export const comboboxAnatomy = createAnatomy('combobox')
  .parts('root', 'label', 'control', 'trigger', 'input', 'clear', 'positioner', 'content', 'list', 'option')
  .build();

/**
 * Zag's dialog anatomy has no `root`, `header` or `body` part; `description` is the
 * frozen contract's `body`. Nothing frozen is renamed or removed.
 */
export const dialogAnatomy = createAnatomy('dialog')
  .parts('root', 'trigger', 'backdrop', 'positioner', 'content', 'header', 'title', 'body', 'closeTrigger')
  .build();

/**
 * `root`..`emptyState` are verbatim from TOKEN-API.md §5 (`table`).
 *
 * Additive parts (documented deviations, no frozen name is renamed or removed):
 * - `caption`, `body` — required for valid `<table>` markup (TOKEN-API §5 omits them).
 * - `firstTrigger`, `lastTrigger`, `item`, `ellipsis` — the stock `@zag-js/pagination`
 *   machine anatomy for the page buttons, re-scoped from `pagination` to `table`.
 */
export const tableAnatomy = createAnatomy('table')
  .parts(
    'root',
    'toolbar',
    'searchField',
    'table',
    'caption',
    'head',
    'body',
    'row',
    'columnheader',
    'rowheader',
    'cell',
    'select',
    'pagination',
    'paginationPageText',
    'firstTrigger',
    'prevTrigger',
    'item',
    'ellipsis',
    'nextTrigger',
    'lastTrigger',
    'status',
    'emptyState',
  )
  .build();
