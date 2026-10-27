/**
 * Deterministic demo data for the stories, the unit tests and the showcase app.
 *
 * These fixtures are *not* a second data contract: the row shape is a structural mirror
 * of `Position` in `packages/contracts/src/types.ts` (same property names, same value
 * kinds) and the option shape is the primitive's `ComboboxOptionItem`. They exist so a
 * CSF story is a runnable fixture (RESEARCH.md §5.1.2) without pulling `contracts` into
 * `ui`, which would close a package cycle.
 */
import type { ComboboxOptionItem, DataTableColumn } from '@designharness/primitives';

/** One position row; structurally assignable to the contract's `Position`. */
export interface PositionFixtureRow {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  markPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  weight: number;
  status: 'open' | 'closed' | 'pending';
  accountType: 'prime' | 'hedge' | 'retail';
  tradedAt: string;
}

export const POSITION_ROWS: readonly PositionFixtureRow[] = [
  {
    id: 'pos-1',
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    quantity: 12_500,
    markPrice: 121.44,
    marketValue: 1_518_000,
    unrealizedPnl: 84_210.5,
    weight: 0.184,
    status: 'open',
    accountType: 'prime',
    tradedAt: '2026-10-02',
  },
  {
    id: 'pos-2',
    symbol: 'AAPL',
    name: 'Apple Inc',
    quantity: 9_000,
    markPrice: 232.1,
    marketValue: 2_088_900,
    unrealizedPnl: -12_480.25,
    weight: 0.253,
    status: 'open',
    accountType: 'hedge',
    tradedAt: '2026-10-05',
  },
  {
    id: 'pos-3',
    symbol: 'ES  F',
    name: 'E-mini S&P 500 futures',
    quantity: 240,
    markPrice: 5_812.25,
    marketValue: 13_949_400,
    unrealizedPnl: 302_115,
    weight: 0.399,
    status: 'pending',
    accountType: 'prime',
    tradedAt: '2026-10-09',
  },
  {
    id: 'pos-4',
    symbol: 'TSLA',
    name: 'Tesla Inc',
    quantity: 4_200,
    markPrice: 402.71,
    marketValue: 1_691_382,
    unrealizedPnl: -98_120.4,
    weight: 0.049,
    status: 'closed',
    accountType: 'retail',
    tradedAt: '2026-09-28',
  },
  {
    id: 'pos-5',
    symbol: 'GC  F',
    name: 'Gold futures',
    quantity: 115,
    markPrice: 2_684.3,
    marketValue: 3_086_945,
    unrealizedPnl: 41_208.75,
    weight: 0.115,
    status: 'open',
    accountType: 'hedge',
    tradedAt: '2026-10-07',
  },
];

/** Rows a server would hand back for page 2 — same shape, different slice. */
export const POSITION_PAGE_TWO: readonly PositionFixtureRow[] = POSITION_ROWS.slice(2);

/** Column ladder for the stories: `valueType: 'numeric'` right-aligns through attributes. */
export const POSITION_COLUMNS: readonly DataTableColumn<PositionFixtureRow>[] = [
  { accessor: 'symbol', header: 'Symbol', sortable: true, valueType: 'text', isRowHeader: true },
  { accessor: 'quantity', header: 'Quantity', sortable: true, valueType: 'numeric' },
  { accessor: 'markPrice', header: 'Mark', sortable: true, valueType: 'numeric' },
  { accessor: 'marketValue', header: 'Market value', sortable: true, valueType: 'numeric' },
  { accessor: 'unrealizedPnl', header: 'Unrealised P&L', sortable: true, valueType: 'numeric' },
  { accessor: 'weight', header: 'Weight', sortable: true, valueType: 'numeric' },
  { accessor: 'status', header: 'Status', sortable: true, valueType: 'text' },
];

/** Default page size used by the table stories. */
export const POSITION_PAGE_SIZE = 3;

/** Instrument options for the combobox stories. */
export interface InstrumentFixture extends ComboboxOptionItem {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

export const INSTRUMENT_ITEMS: readonly InstrumentFixture[] = [
  { value: 'AAPL', label: 'AAPL — Apple Inc' },
  { value: 'ES', label: 'ES — E-mini S&P 500' },
  { value: 'GC', label: 'GC — Gold futures' },
  { value: 'MSFT', label: 'MSFT — Microsoft Corp' },
  { value: 'NVDA', label: 'NVDA — NVIDIA Corp' },
  { value: 'TSLA', label: 'TSLA — Tesla Inc (halted)', disabled: true },
];
