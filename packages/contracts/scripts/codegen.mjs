#!/usr/bin/env node
/**
 * Contract codegen for `@designharness/contracts`.
 *
 * Three steps, in this order:
 *
 *   1. validate the authored OpenAPI documents (structure the harness relies on,
 *      written here rather than delegated so the gate has no dependencies);
 *   2. run `fromOpenApi` over them and emit `generated/handlers.mjs` plus
 *      `generated/manifest.json`, which records the inputs every output came
 *      from — this file is the only place that touches MSW/source for shipping;
 *   3. if `@designharness/engine` is built and `packages/ui/src` holds component
 *      sources, extract component prop metadata into
 *      `generated/component-metadata.json`.
 *      Otherwise that step is reported as skipped on the console and the stale
 *      output is removed: this script never writes a file it did not generate.
 *      A metadata pass that throws is skipped the same way, because a half-landed
 *      `ui` package must not cost the harness the handlers, which are the
 *      deliverable.
 *
 * Run it from anywhere; paths are resolved from this file.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const specDirectory = join(packageRoot, 'openapi');
const generatedDirectory = join(packageRoot, 'generated');

/** The authored contracts, in generation order. */
const CONTRACT_FILES = ['data-table.json', 'combobox.json'];
const GENERATED_HANDLERS = 'handlers.mjs';
const GENERATED_HANDLERS_TYPES = 'handlers.d.mts';
const GENERATED_MANIFEST = 'manifest.json';
const GENERATED_METADATA = 'component-metadata.json';

const log = (message) => console.log(`[contracts:codegen] ${message}`);
const fail = (message) => {
  console.error(`[contracts:codegen] ERROR ${message}`);
};

const toPosix = (path) => path.split(sep).join('/');
const repositoryPath = (absolute) => toPosix(relative(repoRoot, absolute));

const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

// ---------------------------------------------------------------------------
// 1. contract validation
// ---------------------------------------------------------------------------

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolve a document-local JSON pointer. `undefined` means "unresolvable". */
function resolvePointer(document, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return undefined;
  }
  let current = document;
  for (const rawToken of ref.slice(2).split('/')) {
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    current = current[token];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function forEachNode(node, pointer, visit) {
  if (!isObject(node) && !Array.isArray(node)) {
    return;
  }
  visit(node, pointer);
  const entries = Array.isArray(node) ? node.map((value, index) => [index, value]) : Object.entries(node);
  for (const [key, value] of entries) {
    if (!isObject(value) && !Array.isArray(value)) {
      continue;
    }
    const escaped = String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    forEachNode(value, `${pointer}/${escaped}`, visit);
  }
}

/**
 * True when a templated path would match a concrete sibling URL, e.g.
 * `/instruments/{id}` swallowing `/instruments/search`.
 */
function shadows(template, concrete) {
  const left = template.split('/').filter((segment) => segment.length > 0);
  const right = concrete.split('/').filter((segment) => segment.length > 0);
  if (left.length !== right.length || left.join('/') === right.join('/')) {
    return false;
  }
  return left.every((segment, index) => /^\{.+\}$/.test(segment) || segment === right[index]);
}

/**
 * Validate one authored contract. Returns the operation/response counts it
 * declares so the manifest can record what "complete" means.
 */
function validateContract(document) {
  const problems = [];

  if (typeof document['openapi'] !== 'string' || !/^3\.1\./.test(document['openapi'])) {
    problems.push(`openapi must be a 3.1.x version, found ${JSON.stringify(document['openapi'])}`);
  }
  for (const field of ['title', 'version']) {
    if (!isObject(document['info']) || typeof document['info'][field] !== 'string') {
      problems.push(`info.${field} must be a string`);
    }
  }
  if (!Array.isArray(document['servers']) || document['servers'].length === 0) {
    problems.push('servers must declare at least one origin: handler URLs come from it');
  } else {
    for (const [index, server] of document['servers'].entries()) {
      if (!isObject(server) || typeof server.url !== 'string' || !/^https?:\/\//i.test(server.url)) {
        problems.push(`servers[${index}].url must be an absolute http(s) origin`);
      }
    }
  }

  // Every $ref has to resolve inside the document.
  let refCount = 0;
  forEachNode(document, '', (node) => {
    if (!isObject(node) || typeof node['$ref'] !== 'string') {
      return;
    }
    refCount += 1;
    const target = resolvePointer(document, node['$ref']);
    if (target === undefined) {
      problems.push(`unresolvable $ref "${node['$ref']}"`);
    }
  });

  const paths = isObject(document['paths']) ? document['paths'] : undefined;
  if (!paths) {
    problems.push('paths must be present');
    return { problems, operations: 0, responses: 0, refs: refCount };
  }

  const operationIds = new Set();
  let operations = 0;
  let responses = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) {
      problems.push(`path "${path}" must hold a Path Item object`);
      continue;
    }
    const methodEntries = Object.entries(pathItem).filter(([key]) =>
      ['get', 'put', 'post', 'patch', 'delete', 'options', 'head', 'trace'].includes(key),
    );
    for (const [method, operation] of methodEntries) {
      operations += 1;
      if (!isObject(operation)) {
        problems.push(`"${method} ${path}" must be an Operation object`);
        continue;
      }
      if (typeof operation.operationId !== 'string' || operation.operationId.length === 0) {
        problems.push(`"${method} ${path}" needs an operationId: the manifest and the metadata file key off it`);
      } else if (operationIds.has(operation.operationId)) {
        problems.push(`duplicate operationId "${operation.operationId}"`);
      } else {
        operationIds.add(operation.operationId);
      }

      const documented = isObject(operation.responses) ? Object.entries(operation.responses) : [];
      if (documented.length === 0) {
        problems.push(`"${method} ${path}" documents no responses`);
        continue;
      }
      responses += documented.length;

      for (const [status, responseValue] of documented) {
        const response = isObject(responseValue) && typeof responseValue['$ref'] === 'string'
          ? resolvePointer(document, responseValue['$ref'])
          : responseValue;
        if (!isObject(response)) {
          problems.push(`"${method} ${path}" response ${status} is not a Response object`);
          continue;
        }
        if (typeof response.description !== 'string' || response.description.length === 0) {
          problems.push(`"${method} ${path}" response ${status} needs a description`);
        }
        const content = isObject(response.content) ? Object.entries(response.content) : [];
        const hasSchema = content.some(([, media]) => isObject(media) && isObject(media.schema));
        const hasExample = content.some(([, media]) => isObject(media) && (media.example !== undefined || isObject(media.examples)));
        if (!hasSchema && !hasExample) {
          problems.push(`"${method} ${path}" response ${status} declares neither a schema nor an example`);
        }
        if (status.startsWith('2') && !hasExample) {
          problems.push(`"${method} ${path}" response ${status} is a success path without an example: the mock would have nothing to serve`);
        }
      }

      for (const parameter of Array.isArray(operation.parameters) ? operation.parameters : []) {
        const resolved = isObject(parameter) && typeof parameter['$ref'] === 'string' ? resolvePointer(document, parameter['$ref']) : parameter;
        if (!isObject(resolved) || typeof resolved.name !== 'string' || !isObject(resolved.schema)) {
          problems.push(`"${method} ${path}" declares a parameter without a name or a schema`);
        }
      }
    }
  }

  // MSW evaluates handlers in registration order and @msw/source registers
  // them in document order, so a templated path declared first would swallow
  // a concrete sibling (`/instruments/{id}` before `/instruments/search`).
  const pathNames = Object.keys(paths);
  for (const [index, path] of pathNames.entries()) {
    if (!/\{.+\}/.test(path)) {
      continue;
    }
    for (const [siblingIndex, sibling] of pathNames.entries()) {
      if (siblingIndex <= index || /\{.+\}/.test(sibling) || !shadows(path, sibling)) {
        continue;
      }
      problems.push(`path "${path}" would swallow its concrete sibling "${sibling}"; declare concrete paths first`);
    }
  }

  if (operations === 0) {
    problems.push('the contract declares no operations');
  }
  const components = isObject(document['components']) ? document['components'] : {};
  if (!isObject(components['schemas']) || Object.keys(components['schemas']).length === 0) {
    problems.push('components.schemas must declare the payload shapes the guards mirror');
  }
  return { problems, operations, responses, refs: refCount };
}

// ---------------------------------------------------------------------------
// 2. handler generation
// ---------------------------------------------------------------------------

function readContract(fileName) {
  const absolute = join(specDirectory, fileName);
  if (!existsSync(absolute)) {
    throw new Error(`missing contract document: ${repositoryPath(absolute)}`);
  }
  const text = readFileSync(absolute, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${repositoryPath(absolute)} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (!isObject(parsed)) {
    throw new Error(`${repositoryPath(absolute)} is not a JSON object`);
  }
  return { absolute, text, document: parsed };
}

function emitHandlersModule(contracts) {
  const embedded = contracts.map(({ fileName, document }) => ({ fileName, document }));
  const lines = [
    '// GENERATED BY packages/contracts/scripts/codegen.mjs - do not edit by hand.',
    '// Regenerate with: pnpm --filter @designharness/contracts codegen',
    '//',
    `// Sources: ${embedded.map((entry) => entry.fileName).join(', ')}`,
    '//',
    '// A snapshot of the authored contracts plus the @msw/source call that turns',
    '// them into MSW handlers. Import it from a browser bundle to avoid reading',
    '// the documents off disk; the Node path in src/handlers.ts reads the source',
    '// files directly so a stale dist can never masquerade as a contract.',
    '',
    "import { fromOpenApi } from '@msw/source/open-api';",
    '',
    `export const sourceDocuments = ${JSON.stringify(Object.fromEntries(embedded.map((entry) => [entry.fileName, entry.document])), null, 2)};`,
    '',
    `export const documents = [${embedded.map((entry) => `sourceDocuments[${JSON.stringify(entry.fileName)}]`).join(', ')}];`,
    '',
    'export async function createGeneratedHandlers() {',
    '  const batches = await Promise.all(documents.map((document) => fromOpenApi(structuredClone(document))));',
    '  return batches.flat();',
    '}',
    '',
  ];
  const contents = `${lines.join('\n')}\n`;
  writeFileSync(join(generatedDirectory, GENERATED_HANDLERS), contents, 'utf8');

  // A hand-written declaration would be a second place to keep in sync, so the
  // types are derived from the emitted module itself.
  const types = [
    '// GENERATED BY packages/contracts/scripts/codegen.mjs - do not edit by hand.',
    "import type { HttpHandler } from 'msw/http';",
    '',
    'export const sourceDocuments: Record<string, Record<string, unknown>>;',
    'export const documents: readonly Record<string, unknown>[];',
    '/** One MSW handler per response the contracts document. */',
    'export function createGeneratedHandlers(): Promise<readonly HttpHandler[]>;',
    '',
  ].join('\n');
  writeFileSync(join(generatedDirectory, GENERATED_HANDLERS_TYPES), `${types}\n`, 'utf8');

  return [
    { name: GENERATED_HANDLERS, contents },
    { name: GENERATED_HANDLERS_TYPES, contents: types },
  ];
}

// ---------------------------------------------------------------------------
// 3. component prop metadata (engine + ui may not be built yet)
// ---------------------------------------------------------------------------

const kebab = (value) =>
  String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();

/**
 * Directories that never hold a component declaration: build output, dependency
 * trees, snapshots and fixtures. Dotted directories (`.turbo`, `.vite`) are
 * skipped by the same reasoning.
 */
const IGNORED_DIRECTORIES = ['node_modules', 'dist', 'coverage', '__snapshots__', '__fixtures__', 'fixtures'];

/**
 * Files that are delivery artefacts rather than prop declarations: a story is a
 * fixture, a test is a consumer of the props, and a `.d.ts` carries no
 * implementation for the extractor to read defaults from.
 */
const IGNORED_SOURCE = /(?:\.(?:test|spec|stories)\.(?:ts|tsx)|\.d\.ts)$/;

/** Every `.ts`/`.tsx` component source under `directory`, in a stable order. */
function listSourceFiles(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        walk(absolute);
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !IGNORED_SOURCE.test(entry.name)) {
        found.push(absolute);
      }
    }
  };
  walk(directory);
  return found.sort();
}

function normaliseMetadata(entries) {
  const byComponent = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = entry.componentId ?? entry.id ?? entry.displayName ?? entry.name;
    if (typeof name !== 'string' || name.length === 0) {
      continue;
    }
    const props = (Array.isArray(entry.props) ? entry.props : []).map((prop) => ({
      name: prop.name,
      type: typeof prop.type === 'string' ? prop.type : String(prop.type ?? 'unknown'),
      required: prop.required === true,
      default: prop.default === undefined ? null : prop.default,
      description: typeof prop.description === 'string' ? prop.description : '',
    }));
    byComponent[kebab(name)] = { props, source: entry.fileName ?? entry.sourceFile ?? null };
  }
  return byComponent;
}

/**
 * Step 3, and the only step allowed to fail without failing the delivery.
 *
 * Prop metadata describes the components in `packages/ui`, a package that lands
 * after this one and that other agents are editing while this script runs. The
 * mock — steps 1 and 2 — is the contract deliverable, so every reason not to
 * produce metadata is reported as a logged skip and the stale artefact is
 * removed: `generated/component-metadata.json` only ever exists if this run wrote
 * it, and `test/provenance.test.ts` holds the manifest to that promise.
 */
async function generateComponentMetadata() {
  const metadataPath = join(generatedDirectory, GENERATED_METADATA);
  const skip = (reason) => {
    rmSync(metadataPath, { force: true });
    return { status: 'skipped', reason, path: repositoryPath(metadataPath) };
  };

  const engineEntry = join(repoRoot, 'packages', 'engine', 'dist', 'index.js');
  if (!existsSync(engineEntry)) {
    return skip(`@designharness/engine is not built yet (${repositoryPath(engineEntry)} does not exist). Run "pnpm --filter @designharness/engine build" and re-run this script.`);
  }

  const uiSource = join(repoRoot, 'packages', 'ui', 'src');
  if (!existsSync(uiSource)) {
    return skip('packages/ui/src does not exist yet, so there are no component sources to read.');
  }

  const sourceFiles = listSourceFiles(uiSource);
  if (sourceFiles.length === 0) {
    return skip('packages/ui/src holds no component sources yet: no .ts/.tsx file outside tests, stories and declaration files was found.');
  }

  try {
    const engine = await import(pathToFileURL(engineEntry).href);
    if (typeof engine.extractComponentMetadata !== 'function') {
      throw new TypeError('the engine build exposes no extractComponentMetadata export; its API changed or it is a partial build');
    }
    const uiTsconfig = join(repoRoot, 'packages', 'ui', 'tsconfig.json');
    const entries = await engine.extractComponentMetadata({
      sourceFiles,
      // The ui project config is what lets the extractor resolve a shared props
      // interface across files; without it the standalone project still reads the
      // component's own declarations, so its absence degrades rather than breaks.
      ...(existsSync(uiTsconfig) ? { tsconfig: uiTsconfig } : {}),
    });
    const metadata = normaliseMetadata(entries);
    const componentIds = Object.keys(metadata);
    if (componentIds.length === 0) {
      return skip(`no exported component was found in the ${String(sourceFiles.length)} sources under packages/ui/src.`);
    }
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    return {
      status: 'generated',
      path: repositoryPath(metadataPath),
      components: componentIds.length,
      inputs: sourceFiles.length,
    };
  } catch (error) {
    return skip(`component extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(generatedDirectory, { recursive: true });

  const contracts = CONTRACT_FILES.map((fileName) => ({ fileName, ...readContract(fileName) }));

  let invalid = false;
  const recorded = [];
  for (const contract of contracts) {
    const result = validateContract(contract.document);
    const label = repositoryPath(contract.absolute);
    if (result.problems.length > 0) {
      invalid = true;
      fail(`${label}:`);
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
    }
    log(
      `validated ${label} - openapi ${contract.document['openapi']}, ${String(result.operations)} operations, ${String(result.responses)} documented responses, ${String(result.refs)} refs`,
    );
    recorded.push({ ...contract, ...result });
  }
  if (invalid) {
    console.error('[contracts:codegen] refusing to generate handlers from an invalid contract.');
    process.exitCode = 1;
    return;
  }

  const { fromOpenApi } = await import('@msw/source/open-api');
  const handlerCounts = [];
  for (const contract of recorded) {
    const handlers = await fromOpenApi(structuredClone(contract.document));
    handlerCounts.push({ fileName: contract.fileName, handlers: handlers.length });
    log(`@msw/source generated ${String(handlers.length)} handlers from ${contract.fileName}`);
  }

  const emitted = emitHandlersModule(recorded);
  const handlersPath = join(generatedDirectory, GENERATED_HANDLERS);

  const metadata = await generateComponentMetadata();
  if (metadata.status === 'skipped') {
    log(`component metadata: SKIPPED - ${metadata.reason}`);
  } else {
    log(`component metadata: wrote ${metadata.path} for ${String(metadata.components)} components from ${String(metadata.inputs)} sources`);
  }

  const outputs = emitted.map((entry) => ({
    path: repositoryPath(join(generatedDirectory, entry.name)),
    sha256: sha256(entry.contents),
    bytes: Buffer.byteLength(entry.contents),
  }));
  if (metadata.status === 'generated') {
    const contents = readFileSync(join(generatedDirectory, GENERATED_METADATA), 'utf8');
    outputs.push({ path: metadata.path, sha256: sha256(contents), bytes: Buffer.byteLength(contents) });
  }

  const manifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generator: {
      script: repositoryPath(fileURLToPath(import.meta.url)),
      runtime: `node ${process.version}`,
      packages: {
        '@msw/source': require('@msw/source/package.json').version,
        msw: require('msw/package.json').version,
      },
    },
    inputs: recorded.map((contract) => ({
      path: repositoryPath(contract.absolute),
      sha256: sha256(contract.text),
      bytes: Buffer.byteLength(contract.text),
      openapi: contract.document['openapi'],
      title: contract.document['info']['title'],
      operations: contract.operations,
      documentedResponses: contract.responses,
      generatedHandlers: handlerCounts.find((entry) => entry.fileName === contract.fileName).handlers,
    })),
    outputs,
    componentMetadata: metadata,
    provenance:
      'Every handler in generated/handlers.mjs is produced by @msw/source fromOpenApi from the inputs above. Nothing in this package hand-writes a mock response body, so editing a contract is the only way to change the mock.',
  };
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(generatedDirectory, GENERATED_MANIFEST), manifestContents, 'utf8');
  log(`wrote ${repositoryPath(handlersPath)} and ${repositoryPath(join(generatedDirectory, GENERATED_MANIFEST))}`);
  log(`provenance: ${String(manifest.inputs.length)} contract inputs -> ${String(manifest.outputs.length)} generated outputs`);
}

await main();
