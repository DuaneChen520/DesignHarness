/**
 * Vitest for the showcase: the two things that must be true *before* a browser is launched.
 *
 * The heavy assertions (axe in a real kernel, pixel hashes, the network round-trip) live in
 * `e2e/`. These unit tests guard the sensor's own configuration, which is the part that can
 * rot silently: a tag list that lost `wcag22aa`, or a registry that quietly stopped covering
 * a component, would otherwise turn the Tier-3 gate into a green light over nothing.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    globals: false,
    restoreMocks: true,
  },
});
