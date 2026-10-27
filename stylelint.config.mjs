/**
 * Tier-1 sensor — Stylelint gate.
 *
 * Authored CSS must consume tokens: no hardcoded colors, no non-tokenized px
 * lengths, no !important overrides (the classic "specificity war" escape hatch).
 *
 * Generated token artifacts are exempt — they are the tokens themselves.
 */
export default {
  plugins: ['@designharness/stylelint-plugin'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'packages/tokens/dist/**',
    'packages/tokens/tailwind/**',
  ],
  rules: {
    'harness/no-hardcoded-color': true,
    'harness/no-hardcoded-length': true,
    'harness/no-important': true,
    'harness/prefer-token-reference': true,
  },
  overrides: [
    {
      files: ['apps/showcase/src/styles.css', 'packages/ui/src/**/*.css'],
      rules: {
        // `@theme`, `@layer` and `@custom-variant` are Tailwind at-rules, not authored values.
        'harness/no-hardcoded-length': [true, { ignoreAtRules: ['theme', 'media', 'supports', 'container'] }],
      },
    },
  ],
};
