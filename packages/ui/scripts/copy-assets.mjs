// Copies the authored CSS into dist so the `@designharness/ui/styles.css` export resolves
// after `tsc`. `tsc` only emits JavaScript, and the stylesheet is the package's other half:
// the components are useless without it (TOKEN-API.md §4).
//
// @layer order, `@import` statements and every token reference are preserved verbatim — this
// script rewrites nothing.
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const toPosix = (value) => value.replace(/\\/g, '/');
const packageDir = toPosix(fileURLToPath(new URL('../', import.meta.url)));
const srcDir = `${packageDir}src`;
const distDir = `${packageDir}dist`;

/** Files that must survive into dist, in the order the barrel imports them. */
const ROOT_STYLESHEETS = ['styles.css'];
const STYLE_DIRECTORY = 'styles';

/**
 * Sanity check: every `@import './styles/<name>'` in the barrel has a source file, and every
 * source file is imported. A dangling import would ship a stylesheet the browser drops.
 */
async function verifyBarrel(barrelSource) {
  const imported = [...barrelSource.matchAll(/@import\s+'\.\/styles\/([^']+)'/g)].map((match) => match[1]);
  const onDisk = await readdir(`${srcDir}/${STYLE_DIRECTORY}`);
  const authored = onDisk.filter((name) => name.endsWith('.css')).sort();
  const missing = imported.filter((name) => !authored.includes(name));
  const unimported = authored.filter((name) => !imported.includes(name));
  if (missing.length > 0) throw new Error(`styles.css imports files that do not exist: ${missing.join(', ')}`);
  if (unimported.length > 0) throw new Error(`authored CSS is missing from the styles.css barrel: ${unimported.join(', ')}`);
  return { imported, authored };
}

async function main() {
  await mkdir(`${distDir}/${STYLE_DIRECTORY}`, { recursive: true });

  for (const name of ROOT_STYLESHEETS) {
    const source = await readFile(`${srcDir}/${name}`, 'utf8');
    if (name === 'styles.css') await verifyBarrel(source);
    await copyFile(`${srcDir}/${name}`, `${distDir}/${name}`);
  }

  const names = (await readdir(`${srcDir}/${STYLE_DIRECTORY}`)).filter((name) => name.endsWith('.css')).sort();
  for (const name of names) {
    await copyFile(`${srcDir}/${STYLE_DIRECTORY}/${name}`, `${distDir}/${STYLE_DIRECTORY}/${name}`);
  }

  process.stdout.write(
    `copied ${ROOT_STYLESHEETS.length + names.length} stylesheet(s) to dist (${names.join(', ')})\n`,
  );
}

await main();
