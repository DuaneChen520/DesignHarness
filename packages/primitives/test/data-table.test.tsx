import type { DataTableColumn, DataTableQuery } from '../src/data-table.js';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '../src/data-table.js';

/** Structural mirror of `PositionRow` from `packages/contracts/src/types.ts` (trimmed to the columns under test). */
interface TestRow {
  id: string;
  symbol: string;
  quantity: number;
  accountType: string;
}

const ROWS: TestRow[] = [
  { id: 'r1', symbol: 'NVDA', quantity: 40, accountType: 'prime' },
  { id: 'r2', symbol: 'AAPL', quantity: 10, accountType: 'hedge' },
  { id: 'r3', symbol: 'MSFT', quantity: 30, accountType: 'prime' },
  { id: 'r4', symbol: 'TSLA', quantity: 20, accountType: 'retail' },
  { id: 'r5', symbol: 'IBM', quantity: 50, accountType: 'hedge' },
];

const COLUMNS: readonly DataTableColumn<TestRow>[] = [
  { accessor: 'symbol', header: 'Symbol', sortable: true, valueType: 'text', isRowHeader: true },
  { accessor: 'quantity', header: 'Quantity', sortable: true, valueType: 'numeric' },
  { accessor: 'accountType', header: 'Account', valueType: 'text' },
];

const Subject = ({
  rows = ROWS,
  total,
  pageSize = 10,
  loading,
  error,
  selectable = true,
  onQueryChange,
  onSortChange,
  onSelectionChange,
}: {
  rows?: TestRow[];
  total?: number;
  pageSize?: number;
  loading?: boolean;
  error?: string;
  selectable?: boolean;
  onQueryChange?: (query: DataTableQuery) => void;
  onSortChange?: (state: { sortBy: string | undefined; sortOrder: 'asc' | 'desc' }) => void;
  onSelectionChange?: (ids: readonly string[]) => void;
} = {}) => (
  <DataTable.Root
    rows={rows}
    columns={COLUMNS}
    total={total}
    defaultPageSize={pageSize}
    loading={loading}
    error={error}
    selectable={selectable}
    onQueryChange={onQueryChange}
    onSortChange={onSortChange}
    onSelectionChange={onSelectionChange}
  >
    <DataTable.Toolbar>
      <DataTable.SearchField />
    </DataTable.Toolbar>
    <DataTable.Table />
    <DataTable.Pagination />
    <DataTable.Status />
    <DataTable.PageText />
  </DataTable.Root>
);

/** Visible row identity, in rendered order (rows are named by their symbol through `aria-label`). */
const rowOrder = (): string[] =>
  Array.from(document.querySelectorAll('tbody tr[aria-label]')).map((row) => row.getAttribute('aria-label') ?? '');

const columnheader = (name: string | RegExp): HTMLElement =>
  screen.getByRole('columnheader', { name: new RegExp(name, 'i') });
describe('DataTable', () => {
  it('emits the frozen table anatomy with data-scope="table"', () => {
    render(<Subject />);
    for (const part of [
      'root',
      'toolbar',
      'search-field',
      'table',
      'head',
      'body',
      'row',
      'columnheader',
      'rowheader',
      'cell',
      'select',
      'pagination',
      'pagination-page-text',
      'first-trigger',
      'prev-trigger',
      'item',
      'next-trigger',
      'last-trigger',
      'status',
    ]) {
      expect(document.querySelector(`[data-scope="table"][data-part="${part}"]`), part).not.toBeNull();
    }
  });

  it('sorts the rendered rows and cycles aria-sort asc → desc → none on click', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<Subject onSortChange={onSortChange} />);

    const sortButton = screen.getByRole('button', { name: 'Sort by Symbol' });
    const header = columnheader('Symbol');
    expect(header).toHaveAttribute('aria-sort', 'none');

    await user.click(sortButton);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(rowOrder()).toEqual(['AAPL', 'IBM', 'MSFT', 'NVDA', 'TSLA']);
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: 'symbol', sortOrder: 'asc' });

    await user.click(sortButton);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(rowOrder()).toEqual(['TSLA', 'NVDA', 'MSFT', 'IBM', 'AAPL']);
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: 'symbol', sortOrder: 'desc' });

    await user.click(sortButton);
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(rowOrder()).toEqual(['NVDA', 'AAPL', 'MSFT', 'TSLA', 'IBM']);
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: undefined, sortOrder: 'asc' });
  });

  it('cycles the sort from the keyboard with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const sortButton = screen.getByRole('button', { name: 'Sort by Quantity' });
    sortButton.focus();

    await user.keyboard('{Enter}');
    expect(columnheader('Quantity')).toHaveAttribute('aria-sort', 'ascending');

    await user.keyboard(' ');
    expect(columnheader('Quantity')).toHaveAttribute('aria-sort', 'descending');

    // Numeric order, not lexicographic: 10 < 20 < 30 < 40 < 50.
    expect(rowOrder()).toEqual(['IBM', 'NVDA', 'MSFT', 'TSLA', 'AAPL']);
  });

  it('marks numeric cells with data-value-type and attribute-expressed alignment, never CSS', () => {
    render(<Subject />);
    const numericHeader = document.querySelector('[data-part="columnheader"][data-value-type="numeric"]');
    expect(numericHeader).not.toBeNull();
    expect(numericHeader).toHaveAttribute('data-align', 'end');

    const numericCells = document.querySelectorAll<HTMLTableCellElement>(
      'tbody [data-part="cell"][data-value-type="numeric"]',
    );
    expect(numericCells.length).toBe(ROWS.length);
    for (const cell of numericCells) {
      expect(cell).toHaveAttribute('data-align', 'end');
      expect(cell.getAttribute('style')).toBeNull();
    }
  });

  it('selects every row on the page through the header checkbox and clears them again', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<Subject onSelectionChange={onSelectionChange} />);

    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' });
    await user.click(selectAll);

    const rowCheckboxes = screen.getAllByRole('checkbox').filter((box) => box !== selectAll);
    expect(rowCheckboxes).toHaveLength(ROWS.length);
    for (const box of rowCheckboxes) {
      expect(box).toBeChecked();
    }
    const bodyRow = document.querySelector('tbody tr[aria-label]') as HTMLElement;
    expect(bodyRow).toHaveAttribute('aria-selected', 'true');
    expect(onSelectionChange).toHaveBeenLastCalledWith(ROWS.map((row) => row.id));

    await user.click(selectAll);
    for (const box of rowCheckboxes) {
      expect(box).not.toBeChecked();
    }
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('reports the indeterminate state on the select-all header for a partial selection', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' }) as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(false);

    await user.click(screen.getByRole('checkbox', { name: 'Select NVDA' }));
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll.checked).toBe(false);

    // Activating from the partial state completes the selection instead of clearing it.
    await user.click(selectAll);
    expect(selectAll.indeterminate).toBe(false);
    expect(selectAll.checked).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: 'Select NVDA' }));
    expect(selectAll.indeterminate).toBe(true);
  });

  it('drives the pagination machine: aria-current, boundary disabling and the status line', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    render(<Subject pageSize={2} onQueryChange={onQueryChange} />);

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    const prev = within(nav).getByRole('button', { name: 'previous page' });
    const next = within(nav).getByRole('button', { name: 'next page' });
    const pageOne = within(nav).getByRole('button', { name: 'page 1' });
    const pageTwo = within(nav).getByRole('button', { name: 'page 2' });
    const pageThree = within(nav).getByRole('button', { name: /last page, page 3/ });

    // First page boundary: prev is disabled and says so outside of styling.
    expect(prev).toBeDisabled();
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(next).not.toBeDisabled();
    expect(next).not.toHaveAttribute('aria-disabled');
    expect(pageOne).toHaveAttribute('aria-current', 'page');
    expect(pageTwo).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–2 of 5');

    await user.click(pageTwo);
    expect(pageTwo).toHaveAttribute('aria-current', 'page');
    expect(pageOne).not.toHaveAttribute('aria-current');
    expect(prev).not.toBeDisabled();
    expect(rowOrder()).toEqual(['MSFT', 'TSLA']);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 3–4 of 5');
    expect(onQueryChange).toHaveBeenLastCalledWith({ page: 2, pageSize: 2, sortBy: undefined, sortOrder: undefined, q: undefined });

    await user.click(pageThree);
    expect(rowOrder()).toEqual(['IBM']);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 5–5 of 5');

    // Last page boundary: next is disabled and says so outside of styling.
    expect(next).toBeDisabled();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(prev).not.toBeDisabled();
  });

  it('renders the empty state with role="status" when there are no rows', () => {
    render(<Subject rows={[]} />);
    const empty = document.querySelector('[data-part="empty-state"]');
    expect(empty).not.toBeNull();
    expect(empty).toHaveAttribute('role', 'status');
    expect(empty).toHaveTextContent('No data available');
  });

  it('surfaces a failed request through the alert region', () => {
    render(<Subject rows={[]} error="Positions request failed" />);
    const alert = document.querySelector('[data-part="empty-state"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Positions request failed');
  });

  it('sets aria-busy on the table container while loading', () => {
    render(<Subject rows={[]} loading />);
    const table = document.querySelector('[data-part="table"]');
    expect(table).not.toBeNull();
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-scope="table"][data-part="root"]')).toHaveAttribute('aria-busy', 'true');
    const busyRegion = document.querySelector('[data-part="empty-state"]');
    expect(busyRegion).toHaveAttribute('role', 'status');
    expect(busyRegion).toHaveTextContent('Loading…');
  });

  it('keeps busy off the table when data is settled', () => {
    render(<Subject />);
    expect(document.querySelector('[data-part="table"]')).not.toHaveAttribute('aria-busy');
  });

  it('accepts server-paged rows with a total and reports the full count through the status', () => {
    render(<Subject rows={[ROWS[0] as TestRow, ROWS[1] as TestRow]} total={42} pageSize={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–2 of 42');
  });
});
