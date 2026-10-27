/**
 * Public API of `@designharness/primitives`: the five headless components
 * (Button, Input, Combobox, Dialog, DataTable), their prop types and the frozen
 * anatomy definitions from `packages/tokens/TOKEN-API.md` §5.
 *
 * The styled `@designharness/ui` layer imports everything from this barrel;
 * `internal/*` stays private except for the anatomy helpers, which the styled
 * layer and registry metadata reference by part name.
 */

// --- Button ---
export { Button, ButtonRoot } from './button.js';
export type {
  ButtonBehaviorProps,
  ButtonNameProps,
  ButtonNamespace,
  ButtonRootProps,
} from './button.js';

// --- Input ---
export { Input, InputDescription, InputErrorText, InputInput, InputLabel, InputRoot } from './input.js';
export type {
  InputBehaviorProps,
  InputDescriptionProps,
  InputElementIds,
  InputErrorTextProps,
  InputInputProps,
  InputLabelProps,
  InputNamespace,
  InputRootProps,
} from './input.js';

// --- Combobox ---
export {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxLabel,
  ComboboxList,
  ComboboxOption,
  ComboboxPositioner,
  ComboboxRoot,
  ComboboxTrigger,
} from './combobox.js';
export type {
  ComboboxApiValue,
  ComboboxCollection,
  ComboboxListProps,
  ComboboxMachineProps,
  ComboboxNamespace,
  ComboboxOptionItem,
  ComboboxOptionProps,
  ComboboxOptionState,
  ComboboxOwnProps,
  ComboboxRenderState,
  ComboboxRootProps,
  ComboboxTriggerProps,
} from './combobox.js';

// --- Dialog ---
export {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from './dialog.js';
export type {
  DialogApiValue,
  DialogContentProps,
  DialogMachineProps,
  DialogNamespace,
  DialogOwnProps,
  DialogRootProps,
  DialogTitleProps,
  DialogTriggerProps,
} from './dialog.js';

// --- DataTable ---
export {
  DataTable,
  DataTableEllipsis,
  DataTableFirstTrigger,
  DataTableItem,
  DataTableLastTrigger,
  DataTableNextTrigger,
  DataTablePageText,
  DataTablePagination,
  DataTablePrevTrigger,
  DataTableRoot,
  DataTableSearchField,
  DataTableStatus,
  DataTableTable,
  DataTableToolbar,
} from './data-table.js';
export type {
  DataTableAlign,
  DataTableColumn,
  DataTableNamespace,
  DataTableOwnProps,
  DataTablePaginationApi,
  DataTablePaginationProps,
  DataTableQuery,
  DataTableRootProps,
  DataTableSortOrder,
  DataTableSortState,
  DataTableValueType,
} from './data-table.js';

// --- Anatomy helpers (frozen part lists, TOKEN-API.md §5) ---
export {
  buttonAnatomy,
  comboboxAnatomy,
  dialogAnatomy,
  inputAnatomy,
  tableAnatomy,
} from './internal/anatomy.js';
