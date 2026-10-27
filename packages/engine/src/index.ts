/**
 * `@designharness/engine` — public API barrel.
 *
 * Synthesis core for the Design System Harness: DESIGN.md parsing/linting, OKLCH &
 * WCAG/APCA colour math, DTCG 2025.10 artifact synthesis, Style Dictionary v5
 * compilation, ts-morph prop extraction, shadcn registry builders and the WCAG
 * contrast gate.
 */
export * from './colors/index.js';
export * from './designmd/index.js';
export * from './dtcg/index.js';
export * from './style-dictionary/index.js';
export * from './ast/index.js';
export * from './registry/index.js';
export * from './gates/index.js';
