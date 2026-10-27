/**
 * Style Dictionary v5 driver.
 *
 * Registers a custom `harness/name` transform and the `harness/*` formats, then
 * compiles the DTCG artifact into the TOKEN-API output contract: per-mode CSS,
 * the combined `index.css` cascade, Tailwind `@theme`, flat JSON and the JS/TS
 * recipe. `harnessMode` selects which slice a CSS format writes.
 */
import StyleDictionary from 'style-dictionary';
import type { DesignTokens, Format, TransformedToken } from 'style-dictionary/types';
import { computeSets, type ResolvedSets } from './sets.js';
import { publicName } from './values.js';
import {
  renderCssIndex,
  renderCssMode,
  renderFlatJson,
  renderRecipe,
  renderRecipeTypes,
  renderTailwindTheme,
} from './formats.js';
import type { Mode } from './values.js';
import type { JsonObject } from '../dtcg/cli.js';

/** Custom format set; the CSS format branches on `file.options.harnessMode`. */
function setsFrom(dictionaryTokens: readonly TransformedToken[]): ResolvedSets {
  return computeSets(dictionaryTokens);
}

const cssFormat: Format = {
  name: 'harness/css',
  format: ({ dictionary, file }) => {
    const sets = setsFrom(dictionary.allTokens);
    const mode = (file.options as { harnessMode?: Mode | 'index' } | undefined)?.harnessMode ?? 'index';
    return mode === 'index' ? renderCssIndex(sets) : renderCssMode(sets, mode);
  },
};

const tailwindFormat: Format = {
  name: 'harness/tailwind',
  format: ({ dictionary }) => renderTailwindTheme(setsFrom(dictionary.allTokens)),
};

const jsonFlatFormat: Format = {
  name: 'harness/json-flat',
  format: ({ dictionary }) => renderFlatJson(setsFrom(dictionary.allTokens)),
};

const recipeFormat: Format = {
  name: 'harness/recipe',
  format: ({ dictionary }) => renderRecipe(setsFrom(dictionary.allTokens)),
};

const recipeTypesFormat: Format = {
  name: 'harness/recipe-types',
  format: ({ dictionary }) => renderRecipeTypes(setsFrom(dictionary.allTokens)),
};

/** The `harness/name` transform: public (tier/mode-stripped) CSS variable name. */
const harnessNameTransform = {
  name: 'harness/name',
  type: 'name' as const,
  transitive: false,
  transform: (token: TransformedToken) => publicName(token),
};

function cssFile(destination: string, mode: Mode | 'index'): { destination: string; format: string; options: { harnessMode: Mode | 'index' } } {
  return { destination, format: 'harness/css', options: { harnessMode: mode } };
}

export interface StyleDictionaryDirs {
  /** Directory that receives `dist/` (the tokens package root). */
  readonly tokensDir: string;
}

/**
 * Build every artifact from a parsed DTCG artifact object. Returns nothing; files
 * are written to disk under `tokensDir`.
 */
export async function runStyleDictionary(artifact: JsonObject, dirs: StyleDictionaryDirs): Promise<void> {
  const { tokensDir } = dirs;
  const sd = new StyleDictionary({
    usesDtcg: true,
    log: { warnings: 'disabled', verbosity: 'silent' },
    tokens: artifact as unknown as DesignTokens,
    hooks: {
      transforms: { 'harness/name': harnessNameTransform },
      formats: {
        'harness/css': cssFormat.format,
        'harness/tailwind': tailwindFormat.format,
        'harness/json-flat': jsonFlatFormat.format,
        'harness/recipe': recipeFormat.format,
        'harness/recipe-types': recipeTypesFormat.format,
      },
    },
    platforms: {
      css: {
        transformGroup: 'css',
        transforms: ['harness/name'],
        buildPath: `${tokensDir}/dist/css/`,
        options: { outputReferences: true },
        files: [
          cssFile('index.css', 'index'),
          cssFile('light.css', 'light'),
          cssFile('dark.css', 'dark'),
          cssFile('high-contrast.css', 'high-contrast'),
          cssFile('high-contrast-dark.css', 'high-contrast-dark'),
        ],
      },
      tailwind: {
        transformGroup: 'css',
        transforms: ['harness/name'],
        buildPath: `${tokensDir}/tailwind/`,
        files: [{ destination: 'theme.css', format: 'harness/tailwind' }],
      },
      json: {
        transformGroup: 'js',
        transforms: ['harness/name'],
        buildPath: `${tokensDir}/dist/json/`,
        files: [{ destination: 'tokens.json', format: 'harness/json-flat' }],
      },
      recipe: {
        transformGroup: 'js',
        transforms: ['harness/name'],
        buildPath: `${tokensDir}/dist/recipe/`,
        files: [
          { destination: 'index.js', format: 'harness/recipe' },
          { destination: 'index.d.ts', format: 'harness/recipe-types' },
        ],
      },
    },
  });

  await sd.buildAllPlatforms();
}
