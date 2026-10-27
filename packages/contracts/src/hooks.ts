import { useEffect, useState } from 'react';
import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { contractUrl } from './handlers.js';
import {
  instrumentSearchResponseSchema,
  positionListResponseSchema,
  type InstrumentSearchResponse,
  type PositionListResponse,
} from './schemas.js';
import type {
  AccountType,
  PositionSortableField,
  SortOrder,
  TableQuery,
} from './types.js';

export const POSITIONS_OPERATION_ID = 'listPositions';
export const INSTRUMENTS_SEARCH_OPERATION_ID = 'searchInstruments';

export const POSITIONS_PATH = '/api/v1/positions';
export const INSTRUMENTS_SEARCH_PATH = '/api/v1/instruments/search';

/**
 * Deterministic query key builder for DataTable queries.
 * Format: [operationId, params] where params contains normalized, sorted query keys.
 */
export function dataTableQueryKey(query: TableQuery = {}): readonly [string, {
  readonly accountType?: AccountType;
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly sortBy: PositionSortableField;
  readonly sortOrder: SortOrder;
}] {
  return [
    POSITIONS_OPERATION_ID,
    {
      accountType: query.accountType,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      q: query.q ? query.q.trim() : undefined,
      sortBy: query.sortBy ?? 'symbol',
      sortOrder: query.sortOrder ?? 'asc',
    },
  ] as const;
}

export interface UseDataTableQueryOptions
  extends Omit<
    UseQueryOptions<PositionListResponse, Error, PositionListResponse, ReturnType<typeof dataTableQueryKey>>,
    'queryKey' | 'queryFn'
  > {
  readonly origin?: string;
  readonly fetcher?: (url: string, signal?: AbortSignal) => Promise<unknown>;
}

export async function defaultContractFetcher<T>(
  url: string,
  schema: { parse: (input: unknown) => T },
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request to ${url} failed with status ${String(response.status)}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (typeof parsed?.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // Keep default message if not JSON
    }
    throw new Error(message);
  }

  const json: unknown = await response.json();
  return schema.parse(json);
}

/**
 * React hook to fetch and cache DataTable positions according to the OpenAPI contract.
 */
export function useDataTableQuery(
  query: TableQuery = {},
  options: UseDataTableQueryOptions = {},
): UseQueryResult<PositionListResponse, Error> {
  const { origin, fetcher, ...queryOptions } = options;
  const key = dataTableQueryKey(query);
  const normalizedParams = key[1];

  const queryRecord: Record<string, string | number> = {
    page: normalizedParams.page,
    pageSize: normalizedParams.pageSize,
    sortBy: normalizedParams.sortBy,
    sortOrder: normalizedParams.sortOrder,
  };
  if (normalizedParams.q !== undefined && normalizedParams.q.length > 0) {
    queryRecord['q'] = normalizedParams.q;
  }
  if (normalizedParams.accountType !== undefined) {
    queryRecord['accountType'] = normalizedParams.accountType;
  }

  const url = contractUrl(POSITIONS_PATH, queryRecord, origin);

  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      if (fetcher) {
        const raw = await fetcher(url, signal);
        return positionListResponseSchema.parse(raw);
      }
      return defaultContractFetcher(url, positionListResponseSchema, signal);
    },
    ...queryOptions,
  });
}

/**
 * Deterministic query key builder for Combobox search queries.
 * Format: [operationId, params] where params contains normalized, trimmed search text.
 */
export function comboboxSearchQueryKey(params: { readonly q?: string } = {}): readonly [string, { readonly q: string }] {
  return [
    INSTRUMENTS_SEARCH_OPERATION_ID,
    {
      q: (params.q ?? '').trim(),
    },
  ] as const;
}

export interface UseComboboxSearchQueryOptions
  extends Omit<
    UseQueryOptions<InstrumentSearchResponse, Error, InstrumentSearchResponse, ReturnType<typeof comboboxSearchQueryKey>>,
    'queryKey' | 'queryFn'
  > {
  readonly origin?: string;
  readonly debounceMs?: number;
  readonly fetcher?: (url: string, signal?: AbortSignal) => Promise<unknown>;
}

/**
 * React hook to fetch and search Combobox instruments according to the OpenAPI contract.
 * Includes optional debouncing of the search query.
 */
export function useComboboxSearchQuery(
  query: { readonly q?: string } = {},
  options: UseComboboxSearchQueryOptions = {},
): UseQueryResult<InstrumentSearchResponse, Error> {
  const { origin, debounceMs = 0, fetcher, ...queryOptions } = options;
  const rawQ = query.q ?? '';
  const [debouncedQ, setDebouncedQ] = useState(rawQ);

  useEffect(() => {
    if (debounceMs <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQ(rawQ);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [rawQ, debounceMs]);

  const effectiveQ = debounceMs > 0 ? debouncedQ : rawQ;
  const key = comboboxSearchQueryKey({ q: effectiveQ });
  const normalizedParams = key[1];

  const queryRecord: Record<string, string | number> = {};
  if (normalizedParams.q.length > 0) {
    queryRecord['q'] = normalizedParams.q;
  }

  const url = contractUrl(INSTRUMENTS_SEARCH_PATH, queryRecord, origin);

  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      if (fetcher) {
        const raw = await fetcher(url, signal);
        return instrumentSearchResponseSchema.parse(raw);
      }
      return defaultContractFetcher(url, instrumentSearchResponseSchema, signal);
    },
    ...queryOptions,
  });
}
