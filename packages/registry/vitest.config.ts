import { defineConfig } from 'vitest/config';

/**
 * Node environment, no jsdom: the registry suite reads real files, boots a real
 * `node:http` server on an ephemeral port and fetches it — the artifact is the test.
 * `test/registry-build.test.ts` runs the build itself, so the suite is self-contained
 * even against a workspace where `registry/` has never been written.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
