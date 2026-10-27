import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    // These tests spawn the built CLI and the full token pipeline; the default 5s is far too tight.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
