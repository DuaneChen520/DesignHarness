/**
 * `@designharness/registry` — the shadcn-compatible delivery layer.
 *
 * Two jobs, one package:
 *   `build.*`    compile the static registry out of the real workspace artifacts;
 *   `server.*`   serve it (plus the `DESIGN.md` intent file and the downstream sync).
 */
export * from './paths.js';
export * from './schema.js';
export * from './sources.js';
export * from './metadata.js';
export * from './a11y.js';
export * from './build.js';
export * from './server.js';
