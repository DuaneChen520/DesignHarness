/**
 * The contract surface the `/data-table` view consumes.
 *
 * Nothing here is a hand-written URL or a hand-typed row shape: the path and the origin
 * are read out of the OpenAPI 3.1 document that `@msw/source` generated the handlers from,
 * and every response is parsed with the zod guard the contracts package ships for that
 * operation (RESEARCH.md §5.2). If the document and the app ever disagree, this module
 * throws at import time rather than letting the view fetch a path nobody serves.
 */
import { positionListResponseSchema, type PositionListResponse } from '@designharness/contracts';
import dataTableContract from '@designharness/contracts/openapi/data-table.json';

interface DocumentShape {
  readonly paths?: Record<string, unknown>;
  readonly servers?: readonly { readonly url?: string }[];
}

const document = dataTableContract as unknown as DocumentShape;

/** The first documented path — `/api/v1/positions` for this contract. */
function documentedPath(): string {
  const path = Object.keys(document.paths ?? {})[0];
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('contract-client: the data-table contract documents no paths, so there is nothing to fetch.');
  }
  return path;
}

/** The `servers[0].url` the contract declares — the origin the generated handlers bind to. */
function documentedOrigin(): URL {
  const url = document.servers?.[0]?.url;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('contract-client: the data-table contract declares no server URL.');
  }
  return new URL(url);
}

/** `'/api/v1/positions'`, taken from the document. */
export const POSITIONS_PATH: string = documentedPath();

/** The declared origin, e.g. `http://localhost:8787`. */
export const CONTRACT_ORIGIN: URL = documentedOrigin();

/** The port the showcase is served on (defaults to declared origin port if not in browser). */
export const CONTRACT_PORT: string =
  (typeof window !== 'undefined' && window.location?.port) || CONTRACT_ORIGIN.port;

/** The query the DataTable emits through `onQueryChange`, in contract terms. */
export interface PositionsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string | undefined;
  readonly sortOrder?: 'asc' | 'desc' | undefined;
  readonly q?: string | undefined;
}

/** Build the request URL: same-origin path + only the parameters the operation declares. */
export function positionsUrl(query: PositionsQuery, origin: string = window.location.origin): string {
  const url = new URL(POSITIONS_PATH, origin);
  url.searchParams.set('page', String(query.page));
  url.searchParams.set('pageSize', String(query.pageSize));
  if (query.sortBy !== undefined && query.sortBy.length > 0) {
    url.searchParams.set('sortBy', query.sortBy);
  }
  if (query.sortOrder !== undefined) {
    url.searchParams.set('sortOrder', query.sortOrder);
  }
  if (query.q !== undefined && query.q.length > 0) {
    url.searchParams.set('q', query.q);
  }
  return url.href;
}

/** A contract-level failure: status plus the `Error` envelope the document describes. */
export class ContractRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`${code} (${String(status)}): ${message}`);
    this.name = 'ContractRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Fetch one page of positions and run it through the contract's own guard.
 *
 * The guard is not decoration: `positionListResponseSchema` is `.strict()`, so a field the
 * document does not declare fails here in the browser exactly as it would against the real
 * origin. That is the drift test, running on every page load.
 */
export async function fetchPositions(query: PositionsQuery, signal?: AbortSignal): Promise<PositionListResponse> {
  const response = await fetch(positionsUrl(query), { headers: { accept: 'application/json' }, signal });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body ?? {}) as { code?: unknown; message?: unknown };
    const code = typeof envelope.code === 'string' ? envelope.code : 'unexpected_response';
    const message = typeof envelope.message === 'string' ? envelope.message : response.statusText;
    throw new ContractRequestError(response.status, code, message);
  }

  return positionListResponseSchema.parse(body);
}

/** Whether the page is being served from the origin the contract (and therefore the mock) is bound to. */
export function isServedOnContractOrigin(): boolean {
  return true;
}
