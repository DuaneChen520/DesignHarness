/**
 * `@designharness/ui` — the tokenized styling layer of the Meridian design system.
 *
 * Architecture (RESEARCH.md §4, TOKEN-API.md §5): `@designharness/primitives` runs the
 * Zag.js state machines and emits every `data-scope`/`data-part`/`aria-*` attribute;
 * `@designharness/tokens` compiles DESIGN.md into CSS custom properties; this package
 * joins them. The five exports below are thin React wrappers that add class hooks and
 * the markup the machines have no part for (button spinner, dialog footer, combobox
 * glyphs, table toolbar), while `@designharness/ui/styles.css` carries all appearance as
 * `var(--…)` references — no colour, no pixel value, no `!important`, no inline style.
 *
 * The wrappers never read, rewrite or default an `aria-*` attribute: the primitives'
 * contract (`aria-sort` on columnheaders, `role="combobox"` + `aria-expanded` on the
 * combobox input, the dialog label/description wiring) must survive this layer intact.
 */

// --- Button ---
export {
  BUTTON_BLOCK,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  Button,
  buttonClassNames,
  ButtonRoot,
  UIButton,
} from './button.js';
export type { ButtonComponent, ButtonSize, UIButtonProps, ButtonVariant } from './button.js';

// --- Input ---
export { INPUT_BLOCK, Input, InputRoot, UIInput } from './input.js';
export type { InputComponent, UIInputProps } from './input.js';
export { InputDescription, InputErrorText, InputInput, InputLabel } from '@designharness/primitives';

// --- Combobox ---
export {
  Combobox,
  ComboboxClear,
  ComboboxRoot,
  ComboboxTrigger,
  COMBOBOX_BLOCK,
  UICombobox,
} from './combobox.js';
export type {
  ComboboxComponent,
  UIComboboxClearProps,
  UIComboboxProps,
  UIComboboxRootProps,
  UIComboboxTriggerProps,
} from './combobox.js';
export {
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxLabel,
  ComboboxList,
  ComboboxOption,
  ComboboxPositioner,
} from '@designharness/primitives';

// --- Dialog ---
export {
  DIALOG_BLOCK,
  DIALOG_SIZES,
  Dialog,
  dialogContentClassNames,
  DialogCloseTrigger,
  DialogContent,
  DialogRoot,
  DialogTitle,
  UIDialog,
} from './dialog.js';
export type { DialogComponent, DialogSize, UIDialogContentProps, UIDialogProps } from './dialog.js';
export { DialogBackdrop, DialogBody, DialogHeader, DialogPositioner, DialogTrigger } from '@designharness/primitives';

// --- DataTable ---
export { DATA_TABLE_BLOCK, DataTable, DataTableRoot, UIDataTable } from './data-table.js';
export type {
  DataTableComponent,
  UIDataTableProps,
  UIDataTableQuery,
  UIDataTableRootProps,
} from './data-table.js';
export {
  DataTableEllipsis,
  DataTableFirstTrigger,
  DataTableItem,
  DataTableLastTrigger,
  DataTableNextTrigger,
  DataTablePageText,
  DataTablePagination,
  DataTablePrevTrigger,
  DataTableSearchField,
  DataTableStatus,
  DataTableTable,
  DataTableToolbar,
} from '@designharness/primitives';

// --- Primitive prop/type surface the styled layer preserves verbatim ---
export type {
  ButtonRootProps,
  ComboboxCollection,
  ComboboxMachineProps,
  ComboboxOptionItem,
  ComboboxOptionProps,
  ComboboxRenderState,
  ComboboxRootProps,
  DataTableAlign,
  DataTableColumn,
  DataTablePaginationApi,
  DataTableQuery,
  DataTableRootProps,
  DataTableSortOrder,
  DataTableSortState,
  DataTableValueType,
  DialogContentProps,
  DialogRootProps,
  DialogTriggerProps,
  InputElementIds,
  InputRootProps,
} from '@designharness/primitives';
