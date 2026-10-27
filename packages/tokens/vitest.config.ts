import { defineConfig } from 'vitest/config';

/**
 * The token suite is an integration suite: it compiles the real pipeline (DESIGN.md →
 * DTCG → Style Dictionary → Tailwind) instead of mocking it, so a broken sensor cannot
 * pass by accident. See `test/globalSetup.ts`.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 180_000,
    hookTimeout: 600_000,
    globalSetup: ['./test/globalSetup.ts'],
    // One pipeline run per file would serialise badly against the design.md CLI; the
    // suite shares a single generated tree instead, so keep files in sequence-safe
    // order but allow parallel workers (each is read-only against that tree).
    pool: 'forks',
  },
});
