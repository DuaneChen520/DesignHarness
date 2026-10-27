import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Tier-1 sensor: AST level rules. Hardcoded colors / px in source (TSX/CSS) are rigidly blocked.
 */
const noHardcodedVisuals = [
  {
    selector: String.raw`Literal[value=/#[0-9a-fA-F]{3,8}/]`,
    message: 'Hardcoded hex color in source. Consume a design token (var(--color-*) / tokens from @designharness/tokens) instead.',
  },
  {
    selector: String.raw`TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]`,
    message: 'Hardcoded hex color in template literal. Consume a design token instead.',
  },
  {
    selector: String.raw`Literal[value=/\brgba?\(\d/]`,
    message: 'Hardcoded rgb()/rgba() color. Consume a design token instead.',
  },
  {
    selector: String.raw`Literal[value=/\bhsla?\(\d/]`,
    message: 'Hardcoded hsl()/hsla() color. Consume a design token instead.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'packages/tokens/dist/**',
      'packages/registry/dist/**',
      'playwright-report/**',
      'tooling/scaffold/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...noHardcodedVisuals],
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
    },
  },
  {
    files: ['**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['tooling/stylelint-plugin-harness/**/*.mjs', 'tooling/gates/**/*.mjs', 'packages/*/scripts/**/*.mjs'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
