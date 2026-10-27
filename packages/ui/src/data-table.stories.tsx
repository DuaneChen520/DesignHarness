import type { Meta, StoryObj } from './testing/csf.js';
import { withDarkTheme } from './testing/decorators.js';
import { POSITION_COLUMNS, POSITION_PAGE_SIZE, POSITION_ROWS, type PositionFixtureRow } from './testing/data.js';
import { DataTable, type UIDataTableProps } from './index.js';

/**
 * `ui/DataTable` — CSF 3.0 states, including the three the contracts exercise.
 *
 * The rows are a structural mirror of the positions contract, so `Default` is the
 * client-paged case and `Loading`/`Empty`/`Error` are the three shapes an origin can be in
 * while a request is in flight. Sorting stays keyboard-operable because the columnheaders
 * are real buttons carrying `aria-sort`, and the pager is a labelled `nav` region — both
 * primitive-owned.
 */

type TableArgs = UIDataTableProps<PositionFixtureRow>;

const meta: Meta<TableArgs> = {
  title: 'ui/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: false,
      type: { name: 'array', required: true },
      description: 'Column ladder; `valueType: "numeric"` drives the tabular monospace cells.',
    },
    rows: {
      control: false,
      type: { name: 'array', required: true },
      description: 'Rows to render — the current page when `total` is supplied.',
    },
    total: { control: { type: 'number' }, description: 'Full result size for server-paged responses.' },
    loading: { control: { type: 'boolean' }, defaultValue: false },
    loadingText: { control: { type: 'text' } },
    emptyText: { control: { type: 'text' } },
    error: { control: { type: 'text' }, description: 'Surfaced through the role="alert" empty-state region.' },
    selectable: { control: { type: 'boolean' }, defaultValue: false },
    defaultPageSize: { control: { type: 'number' }, defaultValue: 3 },
    defaultSortBy: { control: { type: 'text' } },
    searchPlaceholder: { control: { type: 'text' } },
    caption: { control: { type: 'text' } },
    showToolbar: { control: { type: 'boolean' }, defaultValue: true },
    showPagination: { control: { type: 'boolean' }, defaultValue: true },
    toolbarActions: { control: false },
    onQueryChange: { action: 'queryChange', description: 'The binding point for the generated MSW handlers.' },
  },
  args: {
    columns: POSITION_COLUMNS,
    rows: POSITION_ROWS,
    defaultPageSize: POSITION_PAGE_SIZE,
    caption: 'Open positions by book',
  },
  render: (args) => <DataTable {...args} />,
};

export default meta;

type Story = StoryObj<TableArgs>;

/** Client-paged table with a selection column and the filter control. */
export const Default: Story = { args: { selectable: true } };

/** Secondary treatment: a read-only summary surface — no selection, no filter chrome. */
export const Secondary: Story = { args: { selectable: false, showToolbar: false } };

/** Request in flight: `aria-busy` on the table and the loading region in the body. */
export const Loading: Story = {
  args: { rows: [], loading: true, selectable: true, loadingText: 'Loading positions…' },
};

/** No result for the current query: a status region the operator can read aloud. */
export const Empty: Story = {
  args: { rows: [], emptyText: 'No positions match “prime · open”.' },
};

/** Failed request: the `role="alert"` region names the failure and the remedy. */
export const Error: Story = {
  args: { rows: [], error: 'Position feed unavailable (503). Retry in 30s.' },
};

/** Server-paged: the origin sliced the page, `total` drives the pager maths. */
export const ServerPaged: Story = {
  args: { rows: POSITION_ROWS.slice(0, POSITION_PAGE_SIZE), total: 128, selectable: true },
};

/** Dark re-composition: sunken headers, off-white ink, hairline row rules survive. */
export const Dark: Story = {
  decorators: [withDarkTheme],
  args: { selectable: true, defaultSortBy: 'unrealizedPnl' },
};
