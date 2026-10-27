// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  INSTRUMENTS_SEARCH_OPERATION_ID,
  INSTRUMENTS_SEARCH_PATH,
  POSITIONS_OPERATION_ID,
  POSITIONS_PATH,
  comboboxSearchQueryKey,
  dataTableQueryKey,
  useComboboxSearchQuery,
  useDataTableQuery,
} from '../src/hooks.js';
import type { HarnessMockServer } from '../src/node-adapter.js';
import { setupMockServer } from '../src/node-adapter.js';

let harness: HarnessMockServer;

beforeAll(async () => {
  harness = await setupMockServer();
});

afterAll(() => {
  harness.close();
});

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function TestProvider({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('Query Hooks', () => {
  describe('Query Key Serialization', () => {
    it('serializes dataTableQueryKey predictably and namespaced by OpenAPI operationId', () => {
      const defaultKey = dataTableQueryKey();
      expect(defaultKey).toEqual([
        POSITIONS_OPERATION_ID,
        {
          accountType: undefined,
          page: 1,
          pageSize: 10,
          q: undefined,
          sortBy: 'symbol',
          sortOrder: 'asc',
        },
      ]);
      expect(POSITIONS_OPERATION_ID).toBe('listPositions');
      expect(POSITIONS_PATH).toBe('/api/v1/positions');

      const customKey = dataTableQueryKey({
        page: 3,
        pageSize: 20,
        sortBy: 'marketValue',
        sortOrder: 'desc',
        q: '  apple inc  ',
        accountType: 'prime',
      });
      expect(customKey).toEqual([
        POSITIONS_OPERATION_ID,
        {
          accountType: 'prime',
          page: 3,
          pageSize: 20,
          q: 'apple inc',
          sortBy: 'marketValue',
          sortOrder: 'desc',
        },
      ]);
    });

    it('serializes comboboxSearchQueryKey predictably and namespaced by OpenAPI operationId', () => {
      const emptyKey = comboboxSearchQueryKey();
      expect(emptyKey).toEqual([INSTRUMENTS_SEARCH_OPERATION_ID, { q: '' }]);
      expect(INSTRUMENTS_SEARCH_OPERATION_ID).toBe('searchInstruments');
      expect(INSTRUMENTS_SEARCH_PATH).toBe('/api/v1/instruments/search');

      const trimmedKey = comboboxSearchQueryKey({ q: '   futures  ' });
      expect(trimmedKey).toEqual([INSTRUMENTS_SEARCH_OPERATION_ID, { q: 'futures' }]);
    });
  });

  describe('useDataTableQuery integration with MSW', () => {
    it('fetches and resolves typed positions with default parameters', async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDataTableQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.data).toHaveLength(10);
      expect(result.current.data?.meta).toEqual({
        page: 1,
        pageSize: 10,
        total: 24,
        totalPages: 3,
        sortBy: 'symbol',
        sortOrder: 'asc',
      });
      expect(result.current.data?.data[0]?.symbol).toBe('AAPL');
    });

    it('applies pagination, search and sorting parameters seamlessly through MSW', async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(
        () =>
          useDataTableQuery({
            page: 2,
            pageSize: 5,
            sortBy: 'symbol',
            sortOrder: 'asc',
          }),
        {
          wrapper: createWrapper(queryClient),
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data).toHaveLength(5);
      expect(result.current.data?.meta.page).toBe(2);
      expect(result.current.data?.meta.pageSize).toBe(5);
      expect(result.current.data?.meta.totalPages).toBe(5);
    });

    it('supports custom fetcher if provided', async () => {
      const queryClient = createTestQueryClient();
      let fetcherCalled = false;
      const customFetcher = async (url: string) => {
        fetcherCalled = true;
        const res = await fetch(url);
        return res.json();
      };

      const { result } = renderHook(() => useDataTableQuery({}, { fetcher: customFetcher }), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(fetcherCalled).toBe(true);
      expect(result.current.data?.data).toBeDefined();
    });
  });

  describe('useComboboxSearchQuery integration with MSW', () => {
    it('fetches instruments reference book when query is empty', async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useComboboxSearchQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.items).toHaveLength(18);
    });

    it('filters instruments with search text', async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useComboboxSearchQuery({ q: 'futures' }), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.items).toHaveLength(7);
      const values = result.current.data?.items.map((item) => item.value);
      expect(values).toEqual(['ES', 'NQ', 'CL', 'TY', 'FV', 'GC', 'SI']);
    });

    it('debounces search input when debounceMs is specified', async () => {
      const queryClient = createTestQueryClient();
      const { result, rerender } = renderHook(
        ({ q }: { q: string }) => useComboboxSearchQuery({ q }, { debounceMs: 50 }),
        {
          initialProps: { q: 'usd' },
          wrapper: createWrapper(queryClient),
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data?.items.map((item) => item.value)).toEqual([
        'EURUSD',
        'USDJPY',
        'GBPUSD',
        'BTCUSD',
        'ETHUSD',
      ]);

      // Change query
      rerender({ q: 'futures' });
      // Immediately after re-render, debounced query has not fired yet, so query key hasn't changed or is still previous
      // Wait for debounce timeout to pass and fetch new result
      await waitFor(
        () => {
          expect(result.current.data?.items.map((item) => item.value)).toEqual([
            'ES',
            'NQ',
            'CL',
            'TY',
            'FV',
            'GC',
            'SI',
          ]);
        },
        { timeout: 500 },
      );
    });
  });
});
