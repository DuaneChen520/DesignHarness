import assert from 'node:assert/strict';
import test from 'node:test';
import stylelint from 'stylelint';
import plugins from '../index.mjs';

async function lint(code, rules) {
  const result = await stylelint.lint({
    code,
    config: { plugins, rules },
  });
  return result.results[0].warnings.map((w) => w.rule);
}

test('no-hardcoded-color blocks hex, rgb(), hsl() and named colors', async () => {
  const rules = { 'harness/no-hardcoded-color': true };
  assert.deepEqual(await lint('a { color: #FF0000; }', rules), ['harness/no-hardcoded-color']);
  assert.deepEqual(await lint('a { color: rgb(0 0 0 / 10%); }', rules), ['harness/no-hardcoded-color']);
  assert.deepEqual(await lint('a { color: hsl(220 90% 50%); }', rules), ['harness/no-hardcoded-color']);
  assert.deepEqual(await lint('a { color: white; }', rules), ['harness/no-hardcoded-color']);
  assert.deepEqual(await lint('a { border-color: #1a5fd0; }', rules), ['harness/no-hardcoded-color']);
});

test('no-hardcoded-color allows tokens', async () => {
  const rules = { 'harness/no-hardcoded-color': true };
  assert.deepEqual(await lint('a { color: var(--color-text-primary); }', rules), []);
  assert.deepEqual(await lint('a { color: transparent; }', rules), []);
  assert.deepEqual(await lint('a { color: currentColor; }', rules), []);
  assert.deepEqual(
    await lint('a { color: color-mix(in oklch, var(--color-primary) 10%, transparent); }', rules),
    [],
  );
  assert.deepEqual(
    await lint('a { box-shadow: 0 1px 2px rgb(from var(--color-shadow) r g b / 20%); }', rules),
    [],
  );
});

test('no-hardcoded-color still blocks literals nested beside tokens', async () => {
  const rules = { 'harness/no-hardcoded-color': true };
  assert.deepEqual(await lint('a { background: color-mix(in srgb, oklch(0.5 0.2 240) 10%, var(--color-canvas)); }', rules), [
    'harness/no-hardcoded-color',
  ]);
  assert.deepEqual(await lint('a { color: rgb(0 0 0 / var(--opacity-muted)); }', rules), [
    'harness/no-hardcoded-color',
  ]);
});

test('no-hardcoded-length blocks px but allows tokens, zero and relative units', async () => {
  const rules = { 'harness/no-hardcoded-length': true };
  assert.deepEqual(await lint('a { padding: 16px; }', rules), ['harness/no-hardcoded-length']);
  assert.deepEqual(await lint('a { padding: 0px; }', rules), []);
  assert.deepEqual(await lint('a { padding: 1rem; }', rules), []);
  assert.deepEqual(await lint('a { padding: var(--space-md); }', rules), []);
  assert.deepEqual(await lint('a { border-width: 1px; }', rules), ['harness/no-hardcoded-length']);
  assert.deepEqual(await lint('a { font-size: clamp(1rem, 0.9rem + 0.5vw, 1.5rem); }', rules), []);
});

test('length and token rules compose on the same declaration', async () => {
  const rules = {
    'harness/no-hardcoded-length': true,
    'harness/prefer-token-reference': true,
  };
  assert.deepEqual(await lint('a { padding: 16px; }', rules), [
    'harness/no-hardcoded-length',
    'harness/prefer-token-reference',
  ]);
  assert.deepEqual(await lint('a { padding: var(--space-md); }', rules), []);
});

test('no-hardcoded-length can ignore at-rule contexts', async () => {
  const rules = { 'harness/no-hardcoded-length': [true, { ignoreAtRules: ['theme'] }] };
  assert.deepEqual(await lint('@theme { --spacing-md: 16px; }', rules), []);
});

test('no-important blocks !important', async () => {
  const rules = { 'harness/no-important': true };
  assert.deepEqual(await lint('a { color: var(--x) !important; }', rules), ['harness/no-important']);
});

test('prefer-token-reference requires tokens on tokenized properties', async () => {
  const rules = { 'harness/prefer-token-reference': true };
  assert.deepEqual(await lint('a { background-color: theme(colors.primary); }', rules), []);
  assert.deepEqual(await lint('a { margin: 1rem; }', rules), ['harness/prefer-token-reference']);
  assert.deepEqual(await lint('a { margin: 0; }', rules), []);
  assert.deepEqual(await lint('a { font-family: Inter, sans-serif; }', rules), ['harness/prefer-token-reference']);
  assert.deepEqual(await lint('a { font-family: var(--font-family-body); }', rules), []);
  assert.deepEqual(await lint('a { width: 100%; }', rules), []);
  assert.deepEqual(await lint(':root { --space-md: calc(var(--space-base) * 4); }', rules), []);
});

test('stylelint-disable comments remain honored by the host', async () => {
  const warnings = await lint('a { color: #fff; /* stylelint-disable-line harness/no-hardcoded-color */ }', {
    'harness/no-hardcoded-color': true,
  });
  assert.deepEqual(warnings, []);
});
