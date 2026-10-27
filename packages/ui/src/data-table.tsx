import type { DataTableQuery, DataTableRootProps } from '@designharness/primitives';
import { DataTable as DataTablePrimitive } from '@designharness/primitives';
import type { ReactNode } from 'react';
import { cx, element } from './internal/classnames.js';

/**
 * Styled `DataTable`.
 *
 * Sorting (`aria-sort` on the columnheader, the real `<button>` inside it), selection
 * (`aria-selected`, the indeterminate select-all), the `@zag-js/pagination` machine
 * behind the labelled pagination nav, `aria-busy` while loading and the
 * `role="status"`/`role="alert"` empty-state region are all primitive-owned. This layer
 * arranges the toolbar, table and pager and styles every part from tokens.
 */

/**
 * The query handed to `onQueryChange`.
 *
 * Structurally identical to `TableQuery` in `packages/contracts/src/types.ts`: every
 * member a contract request may carry (`page`, `pageSize`, `sortBy`, `sortOrder`, `q`)
 * is present with the same name and type, and a `UIDataTableQuery` value is assignable
 * straight into `TableQuery`. It is re-declared here rather than imported because
 * `ui -> contracts` would close a package cycle.
 */
export type UIDataTableQuery = DataTableQuery;

/** Block class for every table selector in `styles/data-table.css`. */
export const DATA_TABLE_BLOCK = 'dh-data-table';

/** Props of the faithful styled `table` anatomy root. */
export type UIDataTableRootProps<TRow extends object> = DataTableRootProps<TRow> & {
  className?: string | undefined;
};

/** Anatomy root: context provider only, exactly like `DataTable.Root` in the primitives. */
export function DataTableRoot<TRow extends object>(props: UIDataTableRootProps<TRow>): ReactNode {
  const { className, children, ...restProps } = props;
  return (
    <DataTablePrimitive.Root {...restProps} className={cx(DATA_TABLE_BLOCK, className)}>
      {children}
    </DataTablePrimitive.Root>
  );
}

export type UIDataTableProps<TRow extends object> = Omit<DataTableRootProps<TRow>, 'children'> & {
  /** Placeholder for the filter control — an example, never an instruction. */
  searchPlaceholder?: string | undefined;
  /** Extra controls rendered in the toolbar next to the filter (filters, export, …). */
  toolbarActions?: ReactNode | undefined;
  /** Render the toolbar with the search field. @default true */
  showToolbar?: boolean | undefined;
  /** Render the pagination nav, status and page text. @default true */
  showPagination?: boolean | undefined;
  className?: string | undefined;
};

/**
 * Complete table: toolbar (filter + actions), the table itself and a footer row with
 * the "Showing X–Y of Z" status, the pager nav and the page text. `columns`, `rows`,
 * `total`, `loading`, `error` and `onQueryChange` keep the primitive's exact names and
 * the `DataTableQuery` shape that is structurally identical to `TableQuery` in
 * `packages/contracts/src/types.ts`.
 */
export function UIDataTable<TRow extends object>(props: UIDataTableProps<TRow>): ReactNode {
  const {
    searchPlaceholder = 'Filter rows',
    toolbarActions,
    showToolbar = true,
    showPagination = true,
    className,
    ...restProps
  } = props;

  return (
    <DataTableRoot {...restProps} className={className}>
      {showToolbar ? (
        <DataTablePrimitive.Toolbar className={element(DATA_TABLE_BLOCK, 'toolbar')}>
          <DataTablePrimitive.SearchField placeholder={searchPlaceholder} />
          {toolbarActions !== undefined && toolbarActions !== null ? (
            <div className={element(DATA_TABLE_BLOCK, 'toolbar-actions')}>{toolbarActions}</div>
          ) : null}
        </DataTablePrimitive.Toolbar>
      ) : null}
      <DataTablePrimitive.Table className={element(DATA_TABLE_BLOCK, 'table')} />
      {showPagination ? (
        <div className={element(DATA_TABLE_BLOCK, 'footer')}>
          <DataTablePrimitive.Status />
          <DataTablePrimitive.Pagination />
          <DataTablePrimitive.PageText />
        </div>
      ) : null}
    </DataTableRoot>
  );
}

/** Callable table plus the frozen compound parts. */
export interface DataTableComponent {
  <TRow extends object>(props: UIDataTableProps<TRow>): ReactNode;
  Root: typeof DataTableRoot;
  Toolbar: typeof DataTablePrimitive.Toolbar;
  SearchField: typeof DataTablePrimitive.SearchField;
  Table: typeof DataTablePrimitive.Table;
  Pagination: typeof DataTablePrimitive.Pagination;
  FirstTrigger: typeof DataTablePrimitive.FirstTrigger;
  PrevTrigger: typeof DataTablePrimitive.PrevTrigger;
  Item: typeof DataTablePrimitive.Item;
  Ellipsis: typeof DataTablePrimitive.Ellipsis;
  NextTrigger: typeof DataTablePrimitive.NextTrigger;
  LastTrigger: typeof DataTablePrimitive.LastTrigger;
  Status: typeof DataTablePrimitive.Status;
  PageText: typeof DataTablePrimitive.PageText;
}

export const DataTable: DataTableComponent = Object.assign(UIDataTable, {
  Root: DataTableRoot,
  Toolbar: DataTablePrimitive.Toolbar,
  SearchField: DataTablePrimitive.SearchField,
  Table: DataTablePrimitive.Table,
  Pagination: DataTablePrimitive.Pagination,
  FirstTrigger: DataTablePrimitive.FirstTrigger,
  PrevTrigger: DataTablePrimitive.PrevTrigger,
  Item: DataTablePrimitive.Item,
  Ellipsis: DataTablePrimitive.Ellipsis,
  NextTrigger: DataTablePrimitive.NextTrigger,
  LastTrigger: DataTablePrimitive.LastTrigger,
  Status: DataTablePrimitive.Status,
  PageText: DataTablePrimitive.PageText,
});
