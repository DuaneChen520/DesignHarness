/**
 * `/data-table` — the DataTable mounted against the generated MSW handlers.
 *
 * The request is a real `fetch` from a real browser to the origin the OpenAPI document
 * declares; the response is parsed with the zod guard the contracts package ships for that
 * operation and handed back to the table as `rows` + `total`. Sort, search and pagination
 * all round-trip through the network, which is what `e2e/contract.spec.ts` asserts.
 */
import type { PaginationMeta, Position } from '@designharness/contracts';
import { DataTable, type DataTableColumn, type DataTableQuery } from '@designharness/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTRACT_PORT, POSITIONS_PATH, fetchPositions, positionsUrl } from '../contract-client.js';

/** The column ladder, named exactly as the contract's `sortBy` enum names them. */
const COLUMNS: readonly DataTableColumn<Position>[] = [
  { accessor: 'symbol', header: 'Symbol', sortable: true, isRowHeader: true },
  { accessor: 'name', header: 'Instrument', sortable: true },
  { accessor: 'quantity', header: 'Quantity', sortable: true, valueType: 'numeric' },
  { accessor: 'markPrice', header: 'Mark', sortable: true, valueType: 'numeric' },
  { accessor: 'marketValue', header: 'Market value', sortable: true, valueType: 'numeric' },
  { accessor: 'unrealizedPnl', header: 'Unrealised P&L', sortable: true, valueType: 'numeric' },
  { accessor: 'weight', header: 'Weight %', sortable: true, valueType: 'numeric' },
  { accessor: 'status', header: 'Status', sortable: true },
  { accessor: 'accountType', header: 'Account', sortable: true },
];

const INITIAL_QUERY: DataTableQuery = { page: 1, pageSize: 10, sortBy: 'symbol', sortOrder: 'asc', q: undefined };

/** The settled response for one exact query — the only thing this view needs to remember. */
interface SettledRequest {
  readonly query: DataTableQuery;
  readonly rows: readonly Position[];
  readonly meta: PaginationMeta | undefined;
  readonly error: string | undefined;
}

const EMPTY_ROWS: readonly Position[] = [];

function Chip(props: { readonly name: string; readonly label: string; readonly value: string }): ReactNode {
  return (
    <span className="showcase-view__chip" data-role={props.name}>
      {`${props.label}: ${props.value}`}
    </span>
  );
}

export function PositionsView(): ReactNode {
  const [query, setQuery] = useState<DataTableQuery>(INITIAL_QUERY);
  const [settled, setSettled] = useState<SettledRequest | null>(null);
  /** Only the newest request may write to the table; a superseded response is dropped. */
  const latestRequest = useRef(0);

  // Derived, never stored: a response belongs to the view only while it matches the live query.
  const settledForQuery = settled !== null && settled.query === query;
  const loading = !settledForQuery;
  const rows = settledForQuery ? settled.rows : EMPTY_ROWS;
  const meta = settledForQuery ? settled.meta : undefined;
  const error = settledForQuery ? settled.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    const url = positionsUrl(query);

    fetchPositions(query, controller.signal)
      .then((payload) => {
        if (latestRequest.current !== requestId) {
          return;
        }
        setSettled({ query, rows: payload.data, meta: payload.meta, error: undefined });
      })
      .catch((cause: unknown) => {
        if (latestRequest.current !== requestId || (cause instanceof DOMException && cause.name === 'AbortError')) {
          return;
        }
        const message = cause instanceof Error ? cause.message : 'Position feed returned an unreadable response.';
        setSettled({ query, rows: EMPTY_ROWS, meta: undefined, error: `${message} (${url})` });
      });

    return () => controller.abort();
  }, [query]);

  return (
    <div className="showcase-view" data-role="positions-view">
      <h2 className="showcase-view__title">Positions from the contract mock</h2>
      <p className="showcase__legend">
        The rows are the `example` dataset the OpenAPI document declares, served by handlers generated from that
        document by <code>@msw/source</code>. The app fetches <code>{POSITIONS_PATH}</code> on the origin the document
        declares as its server, so the mock is same-origin on port <code>{CONTRACT_PORT}</code>.
      </p>

      <div className="showcase-view__meta" data-role="request-state">
        <Chip name="last-request" label="last request" value={positionsUrl(query)} />
        <Chip name="page" label="page" value={String(query.page)} />
        <Chip name="sort" label="sort" value={`${query.sortBy ?? 'none'} ${query.sortOrder ?? ''}`.trim()} />
        <Chip name="query" label="q" value={query.q ?? ''} />
        <Chip name="total" label="total" value={meta ? String(meta.total) : '—'} />
        <Chip name="row-count" label="rows" value={String(rows.length)} />
      </div>

      <DataTable<Position>
        columns={COLUMNS}
        rows={rows}
        total={meta?.total}
        page={query.page}
        pageSize={query.pageSize}
        sortBy={query.sortBy}
        sortOrder={query.sortOrder}
        q={query.q}
        onQueryChange={setQuery}
        loading={loading}
        error={error}
        selectable
        caption="Open positions, served by the generated MSW handlers"
        searchPlaceholder="e.g. NVDA, hedge, 2026-10"
        loadingText="Loading positions from the contract mock…"
        emptyText="No positions match the current query."
      />
    </div>
  );
}
