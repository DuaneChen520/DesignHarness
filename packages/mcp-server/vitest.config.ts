import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The catalogs read the compiled token artifact off disk; a single worker keeps the
    // artifact-cache assertions deterministic.
    pool: 'forks',
    testTimeout: 60_000,
  },
});
