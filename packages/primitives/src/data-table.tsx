import type { Api as PaginationApi, PageChangeDetails, PageSizeChangeDetails } from '@zag-js/pagination';
import type { PropTypes } from '@zag-js/react';
import type { ChangeEvent, ComponentPropsWithRef, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { connect, machine as paginationMachine } from '@zag-js/pagination';
import { normalizeProps, useMachine } from '@zag-js/react';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tableAnatomy } from './internal/anatomy.js';
import { createPartContext } from './internal/context.js';
import { ariaAttr, dataAttr } from './internal/props.js';

/**
 * The machine API surface for the embedded `@zag-js/pagination` state machine.
 * Pagination is never modelled by hand: page math, boundaries and the page items
 * collection all come from the real Zag machine.
 */
export type DataTablePaginationApi = PaginationApi<PropTypes>;

/** Sort direction. Mirrors `SortOrder` in `packages/contracts/src/types.ts`. */
export type DataTableSortOrder = 'asc' | 'desc';

/** Horizontal alignment, expressed through `data-align` attributes only — never CSS. */
export type DataTableAlign = 'start' | 'center' | 'end';

/** Cell content kind. Mirrors the `valueType` the styled layer fonts map. */
export type DataTableValueType = 'text' | 'numeric';

/**
 * The query object emitted through `onQueryChange`.
 *
 * Structurally compatible with `TableQuery` in `packages/contracts/src/types.ts`
 * (every contract field is optional here too), plus concrete `page`/`pageSize`
 * values. Duplicated locally on purpose: importing from `@designharness/contracts`
 * would create a package cycle; the styled layer binds the generated MSW mocks
 * with this shape.
 */
export interface DataTableQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string | undefined;
  readonly sortOrder?: DataTableSortOrder | undefined;
  readonly q?: string | undefined;
}

/** A column definition. `accessor` reads the row property; `valueType: 'numeric'` right-aligns via attributes. */
export interface DataTableColumn<TRow extends object> {
  /** The row property this column reads (and sorts by). */
  accessor: Extract<keyof TRow, string>;
  /** Header content rendered inside the columnheader. */
  header: ReactNode;
  /** When true the columnheader wraps its header in a real `<button>` that cycles asc → desc → none. */
  sortable?: boolean | undefined;
  /** Horizontal alignment, emitted as `data-align` on the columnheader and every cell. */
  align?: DataTableAlign | undefined;
  /** Content kind. `'numeric'` sorts numerically and defaults to `'end'` alignment. */
  valueType?: DataTableValueType | undefined;
  /** Renders the cell content; defaults to the stringified accessor value. */
  cell?: ((row: TRow) => ReactNode) | undefined;
  /** Accessible name for the sort button when `header` is not a string. */
  sortLabel?: string | undefined;
  /** Render the first data cell of this column as `<th scope="row">` (the rowheader part). */
  isRowHeader?: boolean | undefined;
}

/** Active sort state: `sortBy === undefined` is the `aria-sort="none"` resting state. */
export interface DataTableSortState {
  readonly sortBy: string | undefined;
  readonly sortOrder: DataTableSortOrder;
}

export interface DataTableOwnProps<TRow extends object> {
  /** The rows to render (client mode: every row; server mode: the current page). */
  rows: readonly TRow[];
  columns: readonly DataTableColumn<TRow>[];
  /**
   * Full result size when the origin already sliced the page. With `total` the
   * rows are rendered as given; without it the machine paginates `rows` itself.
   */
  total?: number | undefined;
  /** Controlled page number (1-based) handed to the pagination machine. */
  page?: number | undefined;
  /** Initial page for uncontrolled pagination. @default 1 */
  defaultPage?: number | undefined;
  /** Controlled page size handed to the pagination machine. */
  pageSize?: number | undefined;
  /** Initial page size for uncontrolled pagination. @default 10 */
  defaultPageSize?: number | undefined;
  /** Controlled sort column (`undefined` = unsorted). */
  sortBy?: string | undefined;
  /** Controlled sort direction (only meaningful with `sortBy`). */
  sortOrder?: DataTableSortOrder | undefined;
  /** Initial sort column for uncontrolled sorting. */
  defaultSortBy?: string | undefined;
  /** Initial sort direction for uncontrolled sorting. @default "asc" */
  defaultSortOrder?: DataTableSortOrder | undefined;
  /** Called with the next sort state whenever a columnheader button cycles it. */
  onSortChange?: ((state: DataTableSortState) => void) | undefined;
  /** Controlled selection, keyed by `getRowId`. */
  selectedRowIds?: readonly string[] | undefined;
  /** Initial selection for uncontrolled `selectedRowIds`. */
  defaultSelectedRowIds?: readonly string[] | undefined;
  /** Called with the full id list after every selection change. */
  onSelectionChange?: ((rowIds: readonly string[]) => void) | undefined;
  /** Stable row identity. Defaults to a string/number `id` property, then the row index. */
  getRowId?: ((row: TRow, index: number) => string) | undefined;
  /** Human row name used for the row `aria-label` and the select checkbox label. */
  getRowLabel?: ((row: TRow, index: number) => string) | undefined;
  /** Controlled search text bound to `DataTable.SearchField`. */
  q?: string | undefined;
  /** Initial search text for uncontrolled `q`. */
  defaultQ?: string | undefined;
  /**
   * Emitted whenever paging, sorting or searching changes — the styled layer's
   * binding point for the generated MSW mock handlers.
   */
  onQueryChange?: ((query: DataTableQuery) => void) | undefined;
  /** Request in flight: sets `aria-busy` and renders the loading empty-state region. */
  loading?: boolean | undefined;
  /** Request failure surfaced through the `role="alert"` empty-state region. */
  error?: ReactNode | undefined;
  /** Content for the `role="status"` empty-state region when there are no rows. */
  emptyText?: ReactNode | undefined;
  /** Content for the loading region while `loading` is true. @default "Loading…" */
  loadingText?: ReactNode | undefined;
  /** `<caption>` content for the table. */
  caption?: ReactNode | undefined;
  /** Enable the selection checkbox column. @default false */
  selectable?: boolean | undefined;
  children: ReactNode;
}

type RootDivElementProps = Omit<ComponentPropsWithRef<'div'>, 'children'>;

export type DataTableRootProps<TRow extends object> = DataTableOwnProps<TRow> & RootDivElementProps;

/** Column metadata with the generic row erased, as carried through the context. */
interface InternalColumn {
  accessor: string;
  header: ReactNode;
  align: DataTableAlign;
  valueType: DataTableValueType;
  sortable: boolean;
  isRowHeader: boolean;
  sortLabel: string;
  getValue: (row: unknown) => unknown;
  render: ((row: unknown) => ReactNode) | undefined;
}

/** The state every `DataTable` part reads from its Root. */
interface DataTableContextValue {
  columns: readonly InternalColumn[];
  pageRows: readonly unknown[];
  selectable: boolean;
  selectedIds: ReadonlySet<string>;
  getRowId: (row: unknown, index: number) => string;
  getRowLabel: (row: unknown, index: number) => string;
  toggleRowSelect: (rowId: string) => void;
  selectAllState: 'all' | 'some' | 'none';
  toggleSelectAll: () => void;
  sortBy: string | undefined;
  sortOrder: DataTableSortOrder;
  toggleSort: (accessor: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  pagination: DataTablePaginationApi;
  count: number;
  total: number | undefined;
  loading: boolean;
  emptyText: ReactNode;
  loadingText: ReactNode;
  error: ReactNode | undefined;
  caption: ReactNode | undefined;
}

const { Provider, useContext: useDataTableContext } = createPartContext<DataTableContextValue>('DataTable');

const textOf = (value: unknown): string => (value == null ? '' : String(value));

const compareValues = (a: unknown, b: unknown, valueType: DataTableValueType): number => {
  if (valueType === 'numeric') {
    const na = a == null ? null : Number(a);
    const nb = b == null ? null : Number(b);
    const validA = na !== null && !Number.isNaN(na);
    const validB = nb !== null && !Number.isNaN(nb);
    if (validA && validB) return na < nb ? -1 : na > nb ? 1 : 0;
    // Missing/NaN values sort to the end of the active direction.
    if (validA) return -1;
    if (validB) return 1;
    return 0;
  }
  return textOf(a).localeCompare(textOf(b));
};

const defaultGetRowId = (row: unknown, index: number): string => {
  const id = (row as { id?: unknown }).id;
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return String(index);
};

/**
 * Headless, unstyled DataTable. Everything the styled layer needs is an attribute:
 * `data-scope="table"` + the frozen `table` anatomy (`root`, `toolbar`, `searchField`,
 * `table`, `head`, `row`, `columnheader`, `rowheader`, `cell`, `select`, `pagination`,
 * `paginationPageText`, `prevTrigger`, `nextTrigger`, `status`, `emptyState`, plus the
 * documented additive parts), `aria-sort`, `aria-selected`, `aria-current`, `aria-busy`,
 * `data-align` and `data-value-type`.
 *
 * - Sorting (controlled or uncontrolled) is applied to the rendered rows; sortable
 *   headers are real `<button>`s inside `<th scope="col">` and cycle asc → desc → none.
 * - Selection adds a checkbox column with a select-all header that reports the
 *   indeterminate state through the native `indeterminate` property.
 * - Pagination runs the real `@zag-js/pagination` machine through `useMachine`:
 *   page items carry `aria-current="page"`, prev/next are `disabled` + `aria-disabled`
 *   at the boundaries, and `status` announces "Showing X–Y of Z".
 */
export function DataTableRoot<TRow extends object>(props: DataTableRootProps<TRow>): ReactNode {
  const {
    rows,
    columns,
    total,
    page,
    defaultPage,
    pageSize,
    defaultPageSize,
    sortBy: sortByProp,
    sortOrder: sortOrderProp,
    defaultSortBy,
    defaultSortOrder,
    onSortChange,
    selectedRowIds: selectedIdsProp,
    defaultSelectedRowIds,
    onSelectionChange,
    getRowId: getRowIdProp,
    getRowLabel: getRowLabelProp,
    q: qProp,
    defaultQ,
    onQueryChange,
    loading = false,
    error,
    emptyText = 'No data available',
    loadingText = 'Loading…',
    caption,
    selectable = false,
    children,
    ...domProps
  } = props;

  const machineId = useId();

  const [internalSort, setInternalSort] = useState<DataTableSortState>(() => ({
    sortBy: defaultSortBy,
    sortOrder: defaultSortOrder ?? 'asc',
  }));
  const sortBy = sortByProp ?? internalSort.sortBy;
  const sortOrder = sortOrderProp ?? internalSort.sortOrder;

  const [internalSelection, setInternalSelection] = useState<readonly string[]>(defaultSelectedRowIds ?? []);
  const selectedIds = selectedIdsProp ?? internalSelection;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [internalQ, setInternalQ] = useState(defaultQ ?? '');
  const searchValue = qProp ?? internalQ;

  const resolvedCount = total ?? rows.length;

  // Every `onQueryChange` emission is built here from values the caller hands in, so
  // no emission path ever touches a not-yet-initialised machine connection.
  const buildQuery = (values: {
    page: number;
    pageSize: number;
    sortBy: string | undefined;
    sortOrder: DataTableSortOrder;
    q: string;
  }): DataTableQuery => ({
    page: values.page,
    pageSize: values.pageSize,
    sortBy: values.sortBy,
    sortOrder: values.sortBy === undefined ? undefined : values.sortOrder,
    q: values.q.length > 0 ? values.q : undefined,
  });

  const service = useMachine(paginationMachine, {
    id: machineId,
    count: resolvedCount,
    page,
    defaultPage: defaultPage ?? 1,
    pageSize,
    defaultPageSize: defaultPageSize ?? 10,
    onPageChange: (details: PageChangeDetails) => {
      onQueryChange?.(
        buildQuery({ page: details.page, pageSize: details.pageSize, sortBy, sortOrder, q: searchValue }),
      );
    },
    onPageSizeChange: (details: PageSizeChangeDetails) => {
      onQueryChange?.(buildQuery({ page: 1, pageSize: details.pageSize, sortBy, sortOrder, q: searchValue }));
    },
  });
  const pagination = connect(service, normalizeProps);

  const emitQuery = useCallback(
    (override: Partial<DataTableQuery>): void => {
      if (onQueryChange === undefined) return;
      onQueryChange(
        buildQuery({
          page: pagination.page,
          pageSize: pagination.pageSize,
          sortBy,
          sortOrder,
          q: searchValue,
          ...override,
        }),
      );
    },
    [onQueryChange, pagination.page, pagination.pageSize, sortBy, sortOrder, searchValue],
  );

  const toggleSort = useCallback(
    (accessor: string): void => {
      const next: DataTableSortState =
        sortBy === accessor
          ? sortOrder === 'asc'
            ? { sortBy: accessor, sortOrder: 'desc' }
            : { sortBy: undefined, sortOrder: 'asc' }
          : { sortBy: accessor, sortOrder: 'asc' };
      if (sortByProp === undefined && sortOrderProp === undefined) {
        setInternalSort(next);
      }
      onSortChange?.(next);
      emitQuery({ sortBy: next.sortBy, sortOrder: next.sortBy === undefined ? undefined : next.sortOrder });
    },
    [sortBy, sortOrder, sortByProp, sortOrderProp, onSortChange, emitQuery],
  );

  const commitSelection = useCallback(
    (next: ReadonlySet<string>): void => {
      const ids = Array.from(next);
      if (selectedIdsProp === undefined) {
        setInternalSelection(ids);
      }
      onSelectionChange?.(ids);
    },
    [selectedIdsProp, onSelectionChange],
  );

  const resolveRowId = useCallback(
    (row: unknown, index: number): string =>
      getRowIdProp !== undefined ? getRowIdProp(row as TRow, index) : defaultGetRowId(row, index),
    [getRowIdProp],
  );

  const toggleRowSelect = useCallback(
    (rowId: string): void => {
      const next = new Set(selectedSet);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      commitSelection(next);
    },
    [selectedSet, commitSelection],
  );

  const sortedRows = useMemo(() => {
    if (sortBy === undefined) return rows;
    const column = columns.find((candidate) => candidate.accessor === sortBy);
    if (column === undefined) return rows;
    const direction = sortOrder === 'asc' ? 1 : -1;
    const decorated = rows.map((row, index) => ({ row, index }));
    const valueOf = (row: TRow): unknown => row[column.accessor];
    decorated.sort(
      (a, b) =>
        direction * compareValues(valueOf(a.row), valueOf(b.row), column.valueType ?? 'text') || a.index - b.index,
    );
    return decorated.map((entry) => entry.row);
  }, [rows, columns, sortBy, sortOrder]);

  const pageRows: readonly TRow[] =
    total === undefined ? pagination.slice([...sortedRows]) : sortedRows;

  const pageRowIds = useMemo(
    () => pageRows.map((row, index) => resolveRowId(row, index)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveRowId reads the latest prop through the closure; pageRows is the only other input.
    [pageRows, getRowIdProp],
  );

  const selectAllState: 'all' | 'some' | 'none' = useMemo(() => {
    if (pageRowIds.length === 0) return 'none';
    const selectedOnPage = pageRowIds.filter((id) => selectedSet.has(id)).length;
    if (selectedOnPage === 0) return 'none';
    return selectedOnPage === pageRowIds.length ? 'all' : 'some';
  }, [pageRowIds, selectedSet]);

  const toggleSelectAll = useCallback((): void => {
    const next = new Set(selectedSet);
    if (selectAllState === 'all') {
      for (const id of pageRowIds) next.delete(id);
    } else {
      for (const id of pageRowIds) next.add(id);
    }
    commitSelection(next);
  }, [selectedSet, selectAllState, pageRowIds, commitSelection]);

  const onSearchChange = useCallback(
    (value: string): void => {
      if (qProp === undefined) {
        setInternalQ(value);
      }
      emitQuery({ q: value.length > 0 ? value : undefined, page: 1 });
    },
    [qProp, emitQuery],
  );

  const defaultLabelFromColumns = useCallback(
    (row: unknown, index: number): string => {
      const first = columns[0];
      if (first === undefined) return String(index);
      return textOf(row === null || typeof row !== 'object' ? undefined : (row as TRow)[first.accessor]);
    },
    [columns],
  );

  const resolveRowLabel = useCallback(
    (row: unknown, index: number): string =>
      getRowLabelProp !== undefined ? getRowLabelProp(row as TRow, index) : defaultLabelFromColumns(row, index),
    [getRowLabelProp, defaultLabelFromColumns],
  );

  const internalColumns = useMemo<readonly InternalColumn[]>(
    () =>
      columns.map((column) => ({
        accessor: column.accessor,
        header: column.header,
        align: column.align ?? (column.valueType === 'numeric' ? 'end' : 'start'),
        valueType: column.valueType ?? 'text',
        sortable: column.sortable === true,
        isRowHeader: column.isRowHeader === true,
        sortLabel:
          column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.accessor),
        getValue: (row: unknown): unknown =>
          row === null || typeof row !== 'object' ? undefined : (row as TRow)[column.accessor],
        render: column.cell === undefined ? undefined : (row: unknown) => column.cell?.(row as TRow),
      })),
    [columns],
  );

  const context = useMemo<DataTableContextValue>(
    () => ({
      columns: internalColumns,
      pageRows,
      selectable,
      selectedIds: selectedSet,
      getRowId: resolveRowId,
      getRowLabel: resolveRowLabel,
      toggleRowSelect,
      selectAllState,
      toggleSelectAll,
      sortBy,
      sortOrder,
      toggleSort,
      searchValue,
      onSearchChange,
      pagination,
      count: resolvedCount,
      total,
      loading,
      emptyText,
      loadingText,
      error,
      caption,
    }),
    // Re-built whenever any input that parts render from changes.
    [
      internalColumns,
      pageRows,
      selectable,
      selectedSet,
      selectAllState,
      sortBy,
      sortOrder,
      searchValue,
      pagination,
      resolvedCount,
      total,
      loading,
      emptyText,
      loadingText,
      error,
      caption,
      resolveRowId,
      resolveRowLabel,
      toggleRowSelect,
      toggleSelectAll,
      toggleSort,
      onSearchChange,
    ],
  );

  return (
    <Provider value={context}>
      <div {...domProps} {...tableAnatomy.root.attrs} aria-busy={ariaAttr(loading)}>
        {children}
      </div>
    </Provider>
  );
}

/** Grouping row for table controls (search field, filters, actions). */
export function DataTableToolbar(props: ComponentPropsWithRef<'div'>): ReactNode {
  const toolbarProps = { ...props, ...tableAnatomy.toolbar.attrs };
  return <div {...toolbarProps} />;
}

/**
 * The search input. Typing resets pagination to page 1 and emits the new `q`
 * through `onQueryChange`; the machine never filters server rows itself.
 */
export function DataTableSearchField(
  props: Omit<ComponentPropsWithRef<'input'>, 'value' | 'type' | 'onChange'> & {
    onChange?: ((value: string) => void) | undefined;
  },
): ReactNode {
  const { onChange, ...restProps } = props;
  const { searchValue, onSearchChange } = useDataTableContext();
  const fieldProps = {
    ...restProps,
    ...tableAnatomy.searchField.attrs,
    type: 'search' as const,
    value: searchValue,
    'aria-label': restProps['aria-label'] ?? 'Filter rows',
    onChange: (event: ChangeEvent<HTMLInputElement>): void => {
      onChange?.(event.currentTarget.value);
      onSearchChange(event.currentTarget.value);
    },
  };
  return <input {...fieldProps} />;
}

/** Select-all checkbox header. Reports the partial state through `indeterminate`. */
function DataTableSelectAllCheckbox(): ReactNode {
  const { selectAllState, toggleSelectAll } = useDataTableContext();
  const ref = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current !== null) {
      ref.current.indeterminate = selectAllState === 'some';
    }
  }, [selectAllState]);
  const checkboxProps = {
    ...tableAnatomy.select.attrs,
    ref,
    type: 'checkbox' as const,
    'aria-label': 'Select all rows',
    checked: selectAllState === 'all',
    onChange: () => {
      toggleSelectAll();
    },
  };
  return <input {...checkboxProps} />;
}

/**
 * The complete `<table>`: columnheaders (with the sort buttons), body rows (with the
 * selection checkboxes and `aria-selected`), `aria-busy` while loading, and the
 * `role="status"`/`role="alert"` empty/loading/error region.
 */
export function DataTableTable(props: ComponentPropsWithRef<'table'>): ReactNode {
  const {
    columns,
    pageRows,
    selectable,
    selectedIds,
    getRowId,
    getRowLabel,
    toggleRowSelect,
    sortBy,
    sortOrder,
    toggleSort,
    loading,
    error,
    emptyText,
    loadingText,
    caption,
  } = useDataTableContext();

  const colSpan = columns.length + (selectable ? 1 : 0);
  const isEmpty = pageRows.length === 0;

  return (
    <table {...props} {...tableAnatomy.table.attrs} aria-busy={ariaAttr(loading)}>
      {caption !== undefined ? <caption {...tableAnatomy.caption.attrs}>{caption}</caption> : null}
      <thead {...tableAnatomy.head.attrs}>
        <tr {...tableAnatomy.row.attrs}>
          {selectable ? (
            <th scope="col" {...tableAnatomy.columnheader.attrs}>
              <DataTableSelectAllCheckbox />
            </th>
          ) : null}
          {columns.map((column) => {
            const isSorted = column.sortable && sortBy === column.accessor;
            const ariaSort = column.sortable
              ? isSorted
                ? sortOrder === 'asc'
                  ? ('ascending' as const)
                  : ('descending' as const)
                : ('none' as const)
              : undefined;
            const headerContent = column.sortable ? (
              <button
                type="button"
                aria-label={`Sort by ${column.sortLabel}`}
                onClick={() => {
                  toggleSort(column.accessor);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  // Enter keeps its native click activation. Space is activated from
                  // keydown with `preventDefault`, which also suppresses the browser's
                  // own click-on-keyup — so the cycle fires exactly once.
                  if (event.key === ' ') {
                    event.preventDefault();
                    toggleSort(column.accessor);
                  }
                }}
              >
                {column.header}
              </button>
            ) : (
              column.header
            );
            return (
              <th
                key={column.accessor}
                scope="col"
                {...tableAnatomy.columnheader.attrs}
                aria-sort={ariaSort}
                data-align={column.align}
                data-value-type={column.valueType}
                data-sortable={dataAttr(column.sortable)}
              >
                {headerContent}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody {...tableAnatomy.body.attrs}>
        {pageRows.map((row, rowIndex) => {
          const id = getRowId(row, rowIndex);
          const label = getRowLabel(row, rowIndex);
          const isSelected = selectedIds.has(id);
          return (
            <tr
              key={id}
              {...tableAnatomy.row.attrs}
              aria-selected={selectable ? (isSelected ? 'true' : 'false') : undefined}
              aria-label={label}
              data-selected={dataAttr(isSelected)}
            >
              {selectable ? (
                <td {...tableAnatomy.cell.attrs}>
                  <input
                    {...tableAnatomy.select.attrs}
                    type="checkbox"
                    aria-label={`Select ${label}`}
                    checked={isSelected}
                    onChange={() => {
                      toggleRowSelect(id);
                    }}
                  />
                </td>
              ) : null}
              {columns.map((column) => {
                const content = column.render !== undefined ? column.render(row) : textOf(column.getValue(row));
                const cellAttrs = {
                  'data-align': column.align,
                  'data-value-type': column.valueType,
                  'data-accessor': column.accessor,
                };
                return column.isRowHeader ? (
                  <th key={column.accessor} scope="row" {...tableAnatomy.rowheader.attrs} {...cellAttrs}>
                    {content}
                  </th>
                ) : (
                  <td key={column.accessor} {...tableAnatomy.cell.attrs} {...cellAttrs}>
                    {content}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {isEmpty ? (
          <tr {...tableAnatomy.row.attrs}>
            <td colSpan={colSpan} {...tableAnatomy.cell.attrs}>
              {loading ? (
                <div role="status" {...tableAnatomy.emptyState.attrs}>
                  {loadingText}
                </div>
              ) : error !== undefined && error !== null ? (
                <div role="alert" {...tableAnatomy.emptyState.attrs}>
                  {error}
                </div>
              ) : (
                <div role="status" {...tableAnatomy.emptyState.attrs}>
                  {emptyText}
                </div>
              )}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** `type="button"` triggers whose accessible names come from the pagination machine translations. */
type PageTriggerProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & { children?: ReactNode };

/**
 * The machine emits native `disabled` at the boundaries; `aria-disabled` is layered on
 * so the state is never signalled by styling alone, exactly like `ButtonRoot`.
 */
function boundaryProps(disabled: boolean): { disabled: boolean; 'aria-disabled': 'true' | undefined } {
  return { disabled, 'aria-disabled': ariaAttr(disabled) };
}

const onFirstPage = (pagination: DataTablePaginationApi): boolean => pagination.page <= 1;
const onLastPage = (pagination: DataTablePaginationApi): boolean => pagination.page >= pagination.totalPages;

/** Jump to the first page. Part of the pagination nav rendered by `DataTable.Pagination` by default. */
export function DataTableFirstTrigger(props: PageTriggerProps): ReactNode {
  const { children = 'First', onClick, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getFirstTriggerProps();
  const triggerProps = {
    ...machineProps,
    ...restProps,
    ...tableAnatomy.firstTrigger.attrs,
    type: 'button' as const,
    ...boundaryProps(onFirstPage(pagination)),
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      (machineProps.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event);
    },
  };
  return <button {...triggerProps}>{children}</button>;
}

/** Previous page trigger: `disabled` + `aria-disabled` on the first page. */
export function DataTablePrevTrigger(props: PageTriggerProps): ReactNode {
  const { children = 'Previous', onClick, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getPrevTriggerProps();
  const triggerProps = {
    ...machineProps,
    ...restProps,
    ...tableAnatomy.prevTrigger.attrs,
    type: 'button' as const,
    ...boundaryProps(onFirstPage(pagination)),
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      (machineProps.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event);
    },
  };
  return <button {...triggerProps}>{children}</button>;
}

/** Next page trigger: `disabled` + `aria-disabled` on the last page. */
export function DataTableNextTrigger(props: PageTriggerProps): ReactNode {
  const { children = 'Next', onClick, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getNextTriggerProps();
  const triggerProps = {
    ...machineProps,
    ...restProps,
    ...tableAnatomy.nextTrigger.attrs,
    type: 'button' as const,
    ...boundaryProps(onLastPage(pagination)),
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      (machineProps.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event);
    },
  };
  return <button {...triggerProps}>{children}</button>;
}

/** Jump to the last page. */
export function DataTableLastTrigger(props: PageTriggerProps): ReactNode {
  const { children = 'Last', onClick, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getLastTriggerProps();
  const triggerProps = {
    ...machineProps,
    ...restProps,
    ...tableAnatomy.lastTrigger.attrs,
    type: 'button' as const,
    ...boundaryProps(onLastPage(pagination)),
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      (machineProps.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event);
    },
  };
  return <button {...triggerProps}>{children}</button>;
}

/** One page button inside the nav; the current page carries `aria-current="page"`. */
export function DataTableItem(props: PageTriggerProps & { page: number }): ReactNode {
  const { page, children, onClick, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getItemProps({ type: 'page', value: page });
  const itemProps = {
    ...machineProps,
    ...restProps,
    ...tableAnatomy.item.attrs,
    type: 'button' as const,
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      (machineProps.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event);
    },
  };
  return <button {...itemProps}>{children ?? page}</button>;
}

/** Collapsed page-range marker inside the nav. */
export function DataTableEllipsis(props: ComponentPropsWithRef<'span'> & { index: number }): ReactNode {
  const { index, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const machineProps = pagination.getEllipsisProps({ index });
  const ellipsisProps = { ...machineProps, ...restProps, ...tableAnatomy.ellipsis.attrs };
  return <span {...ellipsisProps}>…</span>;
}

export interface DataTablePaginationProps extends Omit<ComponentPropsWithRef<'nav'>, 'aria-label'> {
  children?: ReactNode;
}

/**
 * The labelled pagination nav (`aria-label` from the machine). With no children it
 * renders first/prev/page-items/next/last exactly as the `@zag-js/pagination` machine
 * lays out its page collection.
 */
export function DataTablePagination(props: DataTablePaginationProps): ReactNode {
  const { children, ...restProps } = props;
  const { pagination } = useDataTableContext();
  const navProps = {
    ...pagination.getRootProps(),
    ...restProps,
    ...tableAnatomy.pagination.attrs,
  };
  return (
    <nav {...navProps}>
      {children ?? (
        <>
          <DataTableFirstTrigger />
          <DataTablePrevTrigger />
          {pagination.pages.map((entry, index) =>
            entry.type === 'page' ? (
              <DataTableItem key={`page-${String(entry.value)}`} page={entry.value} />
            ) : (
              <DataTableEllipsis key={`ellipsis-${String(index)}`} index={index} />
            ),
          )}
          <DataTableNextTrigger />
          <DataTableLastTrigger />
        </>
      )}
    </nav>
  );
}

/** The "Showing X–Y of Z" announcement. `role="status"` so page changes are spoken. */
export function DataTableStatus(props: ComponentPropsWithRef<'div'>): ReactNode {
  const { pagination } = useDataTableContext();
  const { start, end } = pagination.pageRange;
  const text =
    pagination.count === 0 ? 'Showing 0 of 0' : `Showing ${String(start + 1)}–${String(end)} of ${String(pagination.count)}`;
  const statusProps = { ...props, ...tableAnatomy.status.attrs, role: 'status' as const };
  return <div {...statusProps}>{text}</div>;
}

/** The "Page X of Y" text part (frozen anatomy `paginationPageText`). */
export function DataTablePageText(props: ComponentPropsWithRef<'span'>): ReactNode {
  const { pagination } = useDataTableContext();
  const text = `Page ${String(pagination.page)} of ${String(Math.max(pagination.totalPages, 1))}`;
  const textProps = { ...props, ...tableAnatomy.paginationPageText.attrs };
  return <span {...textProps}>{text}</span>;
}

export interface DataTableNamespace {
  Root: typeof DataTableRoot;
  Toolbar: typeof DataTableToolbar;
  SearchField: typeof DataTableSearchField;
  Table: typeof DataTableTable;
  Pagination: typeof DataTablePagination;
  FirstTrigger: typeof DataTableFirstTrigger;
  PrevTrigger: typeof DataTablePrevTrigger;
  Item: typeof DataTableItem;
  Ellipsis: typeof DataTableEllipsis;
  NextTrigger: typeof DataTableNextTrigger;
  LastTrigger: typeof DataTableLastTrigger;
  Status: typeof DataTableStatus;
  PageText: typeof DataTablePageText;
}

/** Compound namespace mirroring the frozen `table` anatomy. */
export const DataTable: DataTableNamespace = {
  Root: DataTableRoot,
  Toolbar: DataTableToolbar,
  SearchField: DataTableSearchField,
  Table: DataTableTable,
  Pagination: DataTablePagination,
  FirstTrigger: DataTableFirstTrigger,
  PrevTrigger: DataTablePrevTrigger,
  Item: DataTableItem,
  Ellipsis: DataTableEllipsis,
  NextTrigger: DataTableNextTrigger,
  LastTrigger: DataTableLastTrigger,
  Status: DataTableStatus,
  PageText: DataTablePageText,
};
