/**
 * Public component-facing types for the data the contracts drive.
 *
 * These are the props `DataTable` and the async `Combobox` are handed by an
 * app: a query going out, a paged result coming back. They are deliberately
 * free of React and of any fetch implementation, so `ui`, `showcase` and a test
 * can all satisfy them. `test/contract-drift.test.ts` proves the unions and
 * field names here still match the query parameters and row properties the
 * OpenAPI documents declare.
 */
import type { ExportJob, ExportPositionsRequest, Instrument, Position } from './schemas.js';

export type { ExportJob, ExportPositionsRequest, Instrument, Position };

/** One DataTable row, as delivered by the positions contract. */
export type PositionRow = Position;

/** Direction of a sorted column. Mirrors the `sortOrder` enum in the contract. */
export type SortOrder = 'asc' | 'desc';

/** Account buckets the filter control can bind to. Mirrors the `accountType` enum. */
export type AccountType = 'prime' | 'hedge' | 'retail';

/** Position lifecycle states. Mirrors the `status` enum. */
export type PositionStatus = 'open' | 'closed' | 'pending';

/** Columns the contract allows a request to sort by (`id` is never sortable). */
export type PositionSortableField =
  | 'symbol'
  | 'name'
  | 'quantity'
  | 'markPrice'
  | 'marketValue'
  | 'unrealizedPnl'
  | 'weight'
  | 'status'
  | 'tradedAt'
  | 'accountType';

/** Everything the DataTable can ask the origin for, as query parameters. */
export interface TableQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: PositionSortableField;
  readonly sortOrder?: SortOrder;
  /** Case-insensitive substring over the row's text fields. */
  readonly q?: string;
  readonly accountType?: AccountType;
}

/** The pagination envelope, aligned with `components.schemas.PaginationMeta`. */
export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
}

/** One page of rows plus the envelope that describes how it was produced. */
export interface TableResult<TRow> {
  readonly data: readonly TRow[];
  readonly meta: Pagination;
}

/** The state the origin can be in while a table request is in flight. */
export type TableRequestState<TRow> =
  | { readonly status: 'idle' | 'loading'; readonly data?: readonly TRow[]; readonly meta?: Pagination }
  | { readonly status: 'success'; readonly data: readonly TRow[]; readonly meta: Pagination }
  | { readonly status: 'error'; readonly error: unknown; readonly data?: readonly TRow[] };

/**
 * The prop contract `DataTable` needs from its host: paging, sorting, search
 * and export, all shaped by the positions contract.
 */
export interface DataTableContract {
  fetchRows(query: TableQuery, signal?: AbortSignal): Promise<TableResult<PositionRow>>;
  exportPositions(request: ExportPositionsRequest): Promise<ExportJob>;
  exportStatus(jobId: string): Promise<ExportJob>;
}

/** Prop contract the async-search Combobox needs from its host. */
export interface ComboboxContract {
  searchInstruments(query: string, signal?: AbortSignal): Promise<readonly Instrument[]>;
  getInstrument(id: string): Promise<Instrument>;
}

/** The query parameters the positions contract declares for a table request. */
export const TABLE_QUERY_PARAMETERS: readonly string[] = ['page', 'pageSize', 'sortBy', 'sortOrder', 'q', 'accountType'];

/** The `meta` members the positions contract declares. */
export const PAGINATION_META_FIELDS: readonly string[] = ['page', 'pageSize', 'total', 'totalPages', 'sortBy', 'sortOrder'];

/** Sort directions the contract declares for a table request. */
export const TABLE_SORT_DIRECTIONS: readonly SortOrder[] = ['asc', 'desc'];
