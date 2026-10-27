import { defineConfig } from 'vitest/config';

/**
 * The contracts suite runs in Node: MSW's node interceptor plus `fetch` is the
 * whole harness — a mocked response has to survive a real HTTP round trip, not
 * a jsdom approximation of one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    clearMocks: true,
    reporters: ['default'],
  },
});
