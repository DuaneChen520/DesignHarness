/**
 * ts-morph Props extractor.
 *
 * Reads real React component source (TS/TSX) via the TypeScript compiler API and
 * emits machine-readable {@link ComponentMetadataEntry} records: props with
 * resolved (readable) union types, required/optional markers, source-derived
 * defaults (destructured initializers or `defaultProps`), JSDoc descriptions and
 * `@deprecated` notes, plus event callbacks split out separately.
 *
 * This is a genuine extractor — no stubs. It relies on the type checker, so it
 * resolves imported/shared prop interfaces too.
 */
import { basename, extname } from 'node:path';
import { Project, Node, SyntaxKind, ts } from 'ts-morph';
import type { ObjectBindingPattern, PropertySignature, SourceFile, Type } from 'ts-morph';
import type { ComponentMetadataEntry, EventMetadata, ExtractOptions, PropMetadata } from './types.js';

/** kebab-case an identifier / filename stem. */
function kebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isUpperCaseStart(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** Produce a short, readable type string for a checker type. */
function readableType(type: Type): string {
  let text = type.getText().trim();
  // Strip generic qualification prefixes like `import("/path").X.` for readability.
  text = text.replace(/import\([^)]*\)\./g, '');
  return text;
}

interface CollectedDefault {
  readonly name: string;
  readonly value: string;
}

/** Defaults from destructured parameter initializers, e.g. `function B({ size = 'md' })`. */
function defaultsFromBinding(paramNode: Node): CollectedDefault[] {
  const out: CollectedDefault[] = [];
  if (!Node.isParameterDeclaration(paramNode)) return out;
  const binding = paramNode.getNameNode();
  if (!Node.isObjectBindingPattern(binding)) return out;
  for (const el of (binding as ObjectBindingPattern).getElements()) {
    if (Node.isBindingElement(el) && el.hasInitializer()) {
      const nameNode = el.getPropertyNameNode() ?? el.getNameNode();
      const name = nameNode.getText();
      const init = el.getInitializer();
      if (init) out.push({ name, value: init.getText() });
    }
  }
  return out;
}

/** Defaults from a `Component.defaultProps = { … }` assignment in the file. */
function defaultsFromDefaultProps(file: SourceFile, componentName: string): CollectedDefault[] {
  const out: CollectedDefault[] = [];
  for (const binary of file.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const left = binary.getLeft();
    if (!Node.isPropertyAccessExpression(left)) continue;
    if (left.getName() !== 'defaultProps') continue;
    if (left.getExpression().getText() !== componentName) continue;
    const right = binary.getRight();
    if (!Node.isObjectLiteralExpression(right)) continue;
    for (const prop of right.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        out.push({ name: prop.getName(), value: prop.getInitializerOrThrow().getText() });
      }
    }
  }
  return out;
}

/**
 * Extract props metadata from a resolved props type, splitting event callbacks out
 * into their own list.
 */
function extractFromPropsType(
  propsType: Type,
  defaults: readonly CollectedDefault[],
  location: Node,
): { props: PropMetadata[]; events: EventMetadata[] } {
  const props: PropMetadata[] = [];
  const events: EventMetadata[] = [];
  const defaultMap = new Map(defaults.map((d) => [d.name, d.value]));

  for (const symbol of propsType.getApparentType().getProperties()) {
    const name = symbol.getName();
    if (isReactIntrinsic(symbol)) continue;
    const declarations = symbol.getDeclarations();
    const propDecl = declarations.find((d): d is PropertySignature => Node.isPropertySignature(d)) ?? declarations[0];

    const checkerType = symbol.getTypeAtLocation(location);
    // Prefer the WRITTEN type node (e.g. `boolean`, `ButtonVariant`) for readability;
    // the checker type for an optional prop would surface `boolean | undefined`.
    const typeNode = propDecl && Node.isPropertySignature(propDecl) ? propDecl.getTypeNode() : undefined;
    const typeText = typeNode?.getText().trim() || readableType(checkerType);
    const isFn = checkerType.getCallSignatures().length > 0 || /\)\s*=>/.test(typeText);
    const optional = propDecl ? Node.isPropertySignature(propDecl) && propDecl.hasQuestionToken() : false;
    const dv = defaultMap.get(name);

    let description: string | undefined;
    let deprecation: string | undefined;
    if (propDecl && 'getJsDocs' in propDecl && typeof (propDecl as PropertySignature).getJsDocs === 'function') {
      const docs = (propDecl as PropertySignature).getJsDocs();
      const doc = docs[0];
      if (doc) {
        const desc = doc.getDescription().trim();
        if (desc.length > 0) description = desc;
        const tags = doc.getTags();
        const dep = tags.find((t) => t.getTagName() === 'deprecated');
        if (dep) deprecation = (dep.getCommentText() ?? '@deprecated').trim() || '@deprecated';
      }
    }

    const entry: PropMetadata = {
      name,
      type: typeText,
      required: !optional,
      ...(dv !== undefined ? { default: dv } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(deprecation !== undefined ? { deprecation } : {}),
    };

    if (/^on[A-Z]/.test(name) && isFn) {
      events.push({
        name,
        signature: typeText,
        ...(description !== undefined ? { description } : {}),
      });
    } else {
      props.push(entry);
    }
  }

  return { props, events };
}

/** Find the props type for a component's parameter declaration, if any. */
function propsTypeFromParam(paramNode: Node | undefined): Type | undefined {
  if (paramNode === undefined || !Node.isParameterDeclaration(paramNode)) return undefined;
  // Use the checker-resolved type so imported/shared prop interfaces resolve too.
  return paramNode.getType();
}

/**
 * Props of a component expressed as `const X = Object.assign(Base, { … })` (or any callable
 * alias): the props live on the type's call signature, not on a parameter node.
 */
function propsTypeFromCallSignature(type: Type): Type | undefined {
  const signature = type.getCallSignatures()[0];
  if (signature === undefined) return undefined;
  const parameter = signature.getParameters()[0];
  const declaration = parameter?.getValueDeclaration();
  return declaration !== undefined && Node.isParameterDeclaration(declaration) ? declaration.getType() : undefined;
}

/**
 * True when a symbol is a React/DOM intrinsic (declared only inside `@types/react`).
 * Component metadata describes the design-system surface; the ~280 inherited HTML
 * attributes are noise for agents and for the registry docs.
 */
function isReactIntrinsic(symbol: { getDeclarations(): readonly Node[] }): boolean {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) return false;
  return declarations.every((declaration) =>
    declaration.getSourceFile().getFilePath().replaceAll('\\', '/').includes('/@types/react/'),
  );
}

function extractFromFile(file: SourceFile, options: ExtractOptions): ComponentMetadataEntry[] {
  const entries: ComponentMetadataEntry[] = [];
  const id = kebab(basename(file.getFilePath(), extname(file.getFilePath())));
  const filePath = file.getFilePath();

  const consider = (name: string, paramNode: Node | undefined, declaredType?: Type): void => {
    if (!isUpperCaseStart(name)) return;
    const propsType = declaredType === undefined ? propsTypeFromParam(paramNode) : (propsTypeFromParam(paramNode) ?? declaredType);
    const defaults: CollectedDefault[] = [];
    if (paramNode) defaults.push(...defaultsFromBinding(paramNode));
    defaults.push(...defaultsFromDefaultProps(file, name));

    let props: PropMetadata[] = [];
    let events: EventMetadata[] = [];
    if (propsType !== undefined) {
      const extracted = extractFromPropsType(propsType, defaults, file);
      props = extracted.props;
      events = extracted.events;
    }
    // Constants that merely happen to be callable (frozen data, factory helpers) carry no
    // component contract; recording them would pollute the metadata index.
    if (props.length === 0 && events.length === 0) return;
    const displayName = options.displayName ?? name;
    entries.push({ id, name: displayName, sourceFile: filePath, props, events });
  };

  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (name === undefined || !fn.isExported()) continue;
    consider(name, fn.getParameters()[0]);
  }

  for (const v of file.getVariableDeclarations()) {
    if (!v.isExported()) continue;
    const init = v.getInitializer();
    if (init === undefined) continue;
    if (Node.isArrowFunction(init) || Node.isFunctionExpression(init) || Node.isCallExpression(init)) {
      const params = Node.isCallExpression(init) ? undefined : init.getParameters();
      const firstParam = params?.[0];
      if (Node.isCallExpression(init)) {
        // `Object.assign(Base, { … })` and typed aliases resolve their props through the
        // call signature of the declared type.
        consider(v.getName(), firstParam, propsTypeFromCallSignature(v.getType()));
        continue;
      }
      consider(v.getName(), firstParam);
    }
  }

  if (entries.length === 0) return entries;

  // One record per source file: merge every component-shaped export (Root, aliases, compound
  // parts) into a single contract, keeping the widest prop surface and all events.
  const widest = entries.reduce((best, entry) => (entry.props.length > best.props.length ? entry : best), entries[0]!);
  const propByName = new Map(widest.props.map((prop) => [prop.name, prop]));
  const eventByName = new Map(widest.events.map((event) => [event.name, event]));
  for (const entry of entries) {
    for (const prop of entry.props) if (!propByName.has(prop.name)) propByName.set(prop.name, prop);
    for (const event of entry.events) if (!eventByName.has(event.name)) eventByName.set(event.name, event);
  }
  return [
    {
      ...widest,
      props: [...propByName.values()],
      events: [...eventByName.values()],
    },
  ];
}

/**
 * Extract component metadata from one or more source files. When `tsconfig` is
 * supplied the project inherits that configuration (full type resolution incl.
 * imports); otherwise a standalone project with modern JSX settings is used.
 */
export async function extractComponentMetadata(options: ExtractOptions): Promise<ComponentMetadataEntry[]> {
  const project =
    options.tsconfig !== undefined
      ? new Project({ tsConfigFilePath: options.tsconfig })
      : new Project({
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, strict: true, esModuleInterop: true, skipLibCheck: true },
        });

  const files: SourceFile[] = [];
  for (const path of options.sourceFiles) {
    const existing = project.getSourceFile(path);
    const file = existing ?? project.addSourceFileAtPath(path);
    files.push(file);
  }

  // Ensure type resolution has run once.
  await project.resolveSourceFileDependencies();

  const out: ComponentMetadataEntry[] = [];
  for (const file of files) {
    out.push(...extractFromFile(file, options));
  }
  return out;
}
