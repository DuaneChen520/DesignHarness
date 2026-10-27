/**
 * Test-facing surface of the contracts package.
 *
 * Kept as its own entry point because a consumer of `@designharness/contracts`
 * in a browser bundle has no business pulling in a validator it only uses to
 * prove conformance in CI.
 */
export * from './openapi-assert.js';
