/**
 * Synthesises the full W3C DTCG 2025.10 artifact (TOKEN-API.md §2) on top of the
 * official exporter's primitive colour output.
 *
 * Pipeline:
 *   1. The base tier comes from `dtcg/cli.exportDtcgBase` (primitive colours), which
 *      we re-key into `color.primitive[.dark|.hc|.hcDark].<leaf>` after converting
 *      each hex → an `oklch(...)` string via real CSS Color 4 math.
 *   2. Semantic + component tiers are authored here (aliases into the primitives),
 *      using the frozen public role names from TOKEN-API §3. Where DESIGN.md ships a
 *      dedicated dark / high-contrast colour we alias to it; otherwise a role falls
 *      back to its light primitive (a real, sourced value — never a fabricate).
 *
 * Output key order is fully deterministic, so artifact regeneration is byte-stable.
 */
import { formatOklch, hexToRgb, srgbToOklch } from '../colors/convert.js';
import type { DesignDocument } from '../designmd/types.js';
import {
  BORDER_WIDTH,
  CONTROL_HEIGHT,
  DIALOG_MAX_WIDTH,
  DURATIONS,
  EASING,
  ELEVATION_GEOMETRY,
  SPACE_BASE,
  TABLE_ROW_HEIGHTS,
  TARGET_SIZE_MIN,
} from './defaults.js';
import type { JsonObject } from './cli.js';
import type { DtcgArtifact, DtcgGroup, DtcgToken, TokenMode, TokenTier } from './types.js';

/** Public semantic role definition. Leaves are DESIGN colour names per mode. */
interface RoleDef {
  readonly role: string;
  readonly light: string;
  readonly dark?: string;
  readonly hc?: string;
  readonly hcDark?: string;
}

/** Frozen §3 public colour roles → DESIGN.md primitive leaves per mode. */
const ROLE_MAP: readonly RoleDef[] = [
  { role: 'canvas', light: 'canvas', dark: 'canvas', hc: 'canvas', hcDark: 'canvas' },
  { role: 'surface', light: 'surface', dark: 'surface', hc: 'surface', hcDark: 'surface' },
  { role: 'surface-sunken', light: 'surface-sunken', dark: 'surface-sunken', hc: 'surface', hcDark: 'surface' },
  { role: 'surface-raised', light: 'surface-raised', dark: 'surface', hc: 'surface', hcDark: 'surface' },
  { role: 'scrim', light: 'overlay' },
  { role: 'overlay', light: 'overlay' },
  { role: 'text-primary', light: 'text-primary', dark: 'text-primary', hc: 'text', hcDark: 'text' },
  { role: 'text-secondary', light: 'text-secondary', dark: 'text-secondary', hc: 'text', hcDark: 'text' },
  { role: 'text-inverse', light: 'text-on-dark', dark: 'on-primary', hc: 'on-primary', hcDark: 'on-primary' },
  { role: 'primary', light: 'primary', dark: 'primary', hc: 'primary', hcDark: 'primary' },
  { role: 'primary-hover', light: 'primary-hover' },
  { role: 'primary-pressed', light: 'primary-pressed' },
  { role: 'primary-subtle', light: 'primary-subtle', dark: 'primary-subtle', hc: 'surface', hcDark: 'surface' },
  { role: 'on-primary', light: 'on-primary', dark: 'on-primary', hc: 'on-primary', hcDark: 'on-primary' },
  { role: 'on-primary-subtle', light: 'primary', dark: 'primary', hc: 'text', hcDark: 'text' },
  { role: 'border-subtle', light: 'border-subtle', dark: 'border-subtle', hc: 'border', hcDark: 'border' },
  { role: 'border-strong', light: 'border-strong', dark: 'border-strong', hc: 'border', hcDark: 'border' },
  { role: 'border-selected', light: 'focus-ring', dark: 'primary', hc: 'border', hcDark: 'border' },
  { role: 'focus', light: 'focus-ring', dark: 'primary', hc: 'border', hcDark: 'border' },
  { role: 'success', light: 'success', dark: 'success', hc: 'text', hcDark: 'text' },
  { role: 'success-subtle', light: 'success-subtle', hc: 'surface', hcDark: 'surface' },
  { role: 'on-success-subtle', light: 'on-success-subtle', hc: 'text', hcDark: 'text' },
  { role: 'warning', light: 'warning', dark: 'warning', hc: 'text', hcDark: 'text' },
  { role: 'warning-subtle', light: 'warning-subtle', hc: 'surface', hcDark: 'surface' },
  { role: 'on-warning-subtle', light: 'on-warning-subtle', hc: 'text', hcDark: 'text' },
  { role: 'danger', light: 'danger', dark: 'danger', hc: 'text', hcDark: 'text' },
  { role: 'danger-subtle', light: 'danger-subtle', hc: 'surface', hcDark: 'surface' },
  { role: 'on-danger', light: 'on-danger', dark: 'on-primary', hc: 'on-primary', hcDark: 'on-primary' },
  { role: 'on-danger-subtle', light: 'on-danger-subtle', hc: 'text', hcDark: 'text' },
];

const MODE_FOR_BUCKET: Record<'light' | 'dark' | 'hc' | 'hcDark', TokenMode> = {
  light: 'light',
  dark: 'dark',
  hc: 'high-contrast',
  hcDark: 'high-contrast-dark',
};

/**
 * Classify a DESIGN colour name into a primitive bucket + stripped leaf.
 *
 * A `-dark` suffix only marks a *dark-mode variant* when the base name is itself a
 * real light colour (e.g. `canvas-dark` → dark/canvas). Names like `text-on-dark`
 * are light inks that merely end in the substring `-dark`, so they stay in the
 * light bucket under their full name.
 */
function makeClassifier(names: readonly string[]) {
  const nameSet = new Set(names);
  const isLightName = (n: string): boolean => {
    if (n.startsWith('hc-')) return false;
    if (n.endsWith('-dark')) {
      const base = n.slice(0, -5);
      return !(nameSet.has(base) && isLightName(base));
    }
    return true;
  };
  return (name: string): { bucket: 'light' | 'dark' | 'hc' | 'hcDark'; leaf: string } => {
    if (name.startsWith('hc-') && name.endsWith('-dark')) return { bucket: 'hcDark', leaf: name.slice(3, -5) };
    if (name.startsWith('hc-')) return { bucket: 'hc', leaf: name.slice(3) };
    if (name.endsWith('-dark')) {
      const base = name.slice(0, -5);
      if (nameSet.has(base) && isLightName(base)) return { bucket: 'dark', leaf: base };
    }
    return { bucket: 'light', leaf: name };
  };
}

function token(value: DtcgToken['$value'], tier: TokenTier, mode: TokenMode, description?: string): DtcgToken {
  const base: DtcgToken = { $value: value, $extensions: { designharness: { tier, mode } } };
  return description === undefined ? base : { ...base, $description: description };
}

function alias(path: readonly string[]): string {
  return `{${path.join('.')}}`;
}

/** Read the hex for a colour name, preferring the official exporter output. */
function hexFor(name: string, base: JsonObject, doc: DesignDocument): string | undefined {
  const fromBase = (base['color'] as DtcgGroup | undefined)?.[name] as DtcgToken | undefined;
  const baseVal = fromBase?.$value;
  if (baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)) {
    const hex = (baseVal as Record<string, unknown>)['hex'];
    if (typeof hex === 'string') return hex;
  }
  return doc.frontmatter.colors[name];
}

type PrimitiveBuckets = 'light' | 'dark' | 'hc' | 'hcDark';

/** Reference to a primitive for a given bucket, with light fallback. */
function primitiveRef(
  role: RoleDef,
  bucket: PrimitiveBuckets,
  available: Record<PrimitiveBuckets, Set<string>>,
): readonly string[] {
  if (bucket === 'light') return ['color', 'primitive', role.light];
  const leaf = bucket === 'dark' ? role.dark : bucket === 'hc' ? role.hc : role.hcDark;
  if (leaf !== undefined && available[bucket].has(leaf)) {
    return ['color', 'primitive', bucket, leaf];
  }
  // Fallback: this role is not re-composed in this bucket → alias to the light primitive.
  return ['color', 'primitive', role.light];
}

interface PrimitiveResult {
  readonly leaves: DtcgGroup;
  readonly dark: DtcgGroup;
  readonly hc: DtcgGroup;
  readonly hcDark: DtcgGroup;
  readonly available: Record<PrimitiveBuckets, Set<string>>;
}

function buildPrimitives(base: JsonObject, doc: DesignDocument): PrimitiveResult {
  const leaves: DtcgGroup = {};
  const dark: DtcgGroup = {};
  const hc: DtcgGroup = {};
  const hcDark: DtcgGroup = {};
  const available = { light: new Set<string>(), dark: new Set<string>(), hc: new Set<string>(), hcDark: new Set<string>() } as Record<PrimitiveBuckets, Set<string>>;
  const buckets = { light: leaves, dark, hc, hcDark } as Record<PrimitiveBuckets, DtcgGroup>;
  const classify = makeClassifier(Object.keys(doc.frontmatter.colors));

  for (const name of Object.keys(doc.frontmatter.colors)) {
    const hex = hexFor(name, base, doc);
    if (hex === undefined) continue;
    const { bucket, leaf } = classify(name);
    const oklch = formatOklch(srgbToOklch(hexToRgb(hex)));
    buckets[bucket][leaf] = token(oklch, 'primitive', MODE_FOR_BUCKET[bucket], `Primitive ${bucket} colour ${name}`);
    available[bucket].add(leaf);
  }

  return { leaves, dark, hc, hcDark, available };
}

/**
 * Build the semantic group. Light roles sit directly under `semantic`; each other
 * mode is a sub-group. Value is always an alias into the primitive tier.
 */
function buildSemantics(p: PrimitiveResult): DtcgGroup {
  const semantic: DtcgGroup = {};
  const dark: DtcgGroup = {};
  const highContrast: DtcgGroup = {};
  const highContrastDark: DtcgGroup = {};

  for (const role of ROLE_MAP) {
    semantic[role.role] = token(alias(primitiveRef(role, 'light', p.available)), 'semantic', 'light', `Semantic ${role.role}`);
    dark[role.role] = token(alias(primitiveRef(role, 'dark', p.available)), 'semantic', 'dark', `Semantic ${role.role} (dark)`);
    highContrast[role.role] = token(alias(primitiveRef(role, 'hc', p.available)), 'semantic', 'high-contrast', `Semantic ${role.role} (high contrast)`);
    highContrastDark[role.role] = token(alias(primitiveRef(role, 'hcDark', p.available)), 'semantic', 'high-contrast-dark', `Semantic ${role.role} (high contrast dark)`);
  }

  semantic['dark'] = dark;
  semantic['highContrast'] = highContrast;
  semantic['highContrastDark'] = highContrastDark;
  return semantic;
}

/** Map a DESIGN colour name to its public semantic role name. */
function roleForDesignName(name: string): string {
  const direct = ROLE_MAP.find((r) => r.light === name);
  if (direct) return direct.role;
  return name;
}

/** Parse a `{rounded.md}` style component value into its leaf, or null. */
function refLeaf(raw: string | number | undefined, group: string): string | null {
  if (typeof raw !== 'string') return null;
  const m = new RegExp(`^\\{${group}\\.([a-zA-Z0-9-]+)\\}$`).exec(raw.trim());
  return m?.[1] ?? null;
}

function designColorRef(raw: string | number | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^\{colors\.([a-zA-Z0-9-]+)\}$/.exec(raw.trim());
  return m?.[1] ?? null;
}

function buildColorComponents(doc: DesignDocument): DtcgGroup {
  const out: DtcgGroup = {};
  for (const [comp, style] of Object.entries(doc.frontmatter.components)) {
    const bg = designColorRef(style['backgroundColor']);
    const fg = designColorRef(style['textColor']);
    if (bg === null && fg === null) continue;
    const node: DtcgGroup = {};
    if (bg !== null) node['background'] = token(alias(['color', 'semantic', roleForDesignName(bg)]), 'component', 'light', `Component ${comp} background`);
    if (fg !== null) node['foreground'] = token(alias(['color', 'semantic', roleForDesignName(fg)]), 'component', 'light', `Component ${comp} foreground`);
    out[comp] = node;
  }
  return out;
}

function buildSpace(doc: DesignDocument): DtcgGroup {
  const g: DtcgGroup = { $type: 'dimension' };
  g['base'] = token(SPACE_BASE, 'semantic', 'light', 'Grid base unit (0.25rem)');
  for (const [name, value] of Object.entries(doc.frontmatter.spacing)) {
    g[name] = token(value, 'semantic', 'light', `Spacing ${name}`);
  }
  return g;
}

function buildRadius(doc: DesignDocument): DtcgGroup {
  const g: DtcgGroup = { $type: 'dimension' };
  for (const [name, value] of Object.entries(doc.frontmatter.rounded)) {
    g[name] = token(value, 'semantic', 'light', `Radius ${name}`);
  }
  return g;
}

function buildFont(doc: DesignDocument): DtcgGroup {
  const styles = doc.frontmatter.typography;
  const firstFamily = (keys: string[]): string => {
    for (const k of keys) {
      const fam = styles[k]?.['fontFamily'];
      if (typeof fam === 'string') return fam;
    }
    return 'system-ui';
  };

  const family: DtcgGroup = { $type: 'fontFamily' };
  family['body'] = token(firstFamily(['body-md', 'body-sm', 'body-lg']), 'semantic', 'light', 'Body text family');
  family['display'] = token(firstFamily(['display-lg', 'heading-1']), 'semantic', 'light', 'Display family');
  family['mono'] = token(firstFamily(['numeric-md', 'numeric-lg']), 'semantic', 'light', 'Monospace / numeric family');

  const size: DtcgGroup = { $type: 'dimension' };
  const weight: DtcgGroup = { $type: 'number' };
  const lineHeight: DtcgGroup = { $type: 'number' };
  const letterSpacing: DtcgGroup = { $type: 'dimension' };

  for (const [name, style] of Object.entries(styles)) {
    if (typeof style['fontSize'] === 'string') size[name] = token(style['fontSize'], 'semantic', 'light', `Font size ${name}`);
    if (style['fontWeight'] !== undefined) weight[name] = token(Number(style['fontWeight']), 'semantic', 'light', `Font weight ${name}`);
    if (style['lineHeight'] !== undefined) lineHeight[name] = token(Number(style['lineHeight']), 'semantic', 'light', `Line height ${name}`);
    if (typeof style['letterSpacing'] === 'string') letterSpacing[name] = token(style['letterSpacing'], 'semantic', 'light', `Letter spacing ${name}`);
  }

  return { family, size, weight, lineHeight, letterSpacing };
}

function buildDuration(): DtcgGroup {
  const g: DtcgGroup = { $type: 'duration' };
  for (const [name, value] of Object.entries(DURATIONS)) g[name] = token(value, 'semantic', 'light', `Duration ${name}`);
  return g;
}

function buildEasing(): DtcgGroup {
  const g: DtcgGroup = { $type: 'cubicBezier' };
  for (const [name, value] of Object.entries(EASING)) g[name] = token([...value], 'semantic', 'light', `Easing ${name}`);
  return g;
}

function buildElevation(primitiveLeaves: DtcgGroup): DtcgGroup {
  const g: DtcgGroup = { $type: 'shadow' };
  const overlayToken = primitiveLeaves['overlay'] as DtcgToken | undefined;
  const overlayOklch = typeof overlayToken?.$value === 'string' ? overlayToken.$value : undefined;
  g['0'] = token('none', 'semantic', 'light', 'Elevation 0 (flat)');
  for (const [level, geo] of Object.entries(ELEVATION_GEOMETRY)) {
    const color = overlayOklch !== undefined ? withAlpha(overlayOklch, geo.alpha) : 'transparent';
    g[level] = token(
      { color, offsetX: geo.offsetX, offsetY: geo.offsetY, blur: geo.blur, spread: geo.spread },
      'semantic',
      'light',
      `Elevation ${level} shadow`,
    );
  }
  return g;
}

/** Insert alpha into an `oklch(L C H)` string → `oklch(L C H / A)`. */
function withAlpha(oklch: string, alpha: number): string {
  return oklch.replace(')', ` / ${alpha})`);
}

function buildControl(): DtcgGroup {
  const height: DtcgGroup = { $type: 'dimension' };
  for (const [name, value] of Object.entries(CONTROL_HEIGHT)) height[name] = token(value, 'semantic', 'light', `Control height ${name}`);
  return { height };
}

function buildTarget(): DtcgGroup {
  const size: DtcgGroup = { $type: 'dimension' };
  size['min'] = token(TARGET_SIZE_MIN, 'semantic', 'light', 'Minimum interactive target (WCAG 2.2 SC 2.5.8)');
  return { size };
}

function buildBorder(): DtcgGroup {
  const width: DtcgGroup = { $type: 'dimension' };
  for (const [name, value] of Object.entries(BORDER_WIDTH)) width[name] = token(value, 'semantic', 'light', `Border width ${name}`);
  return { width };
}

function buildComponentGroups(doc: DesignDocument): Record<string, DtcgGroup> {
  const c = doc.frontmatter.components;
  const str = (comp: string, key: string): string | undefined => {
    const v = c[comp]?.[key];
    return v === undefined ? undefined : String(v);
  };

  const button: DtcgGroup = { $type: 'dimension' };
  button['height'] = token(str('button-primary', 'height') ?? CONTROL_HEIGHT.md, 'component', 'light', 'Button height');
  button['padding-inline'] = token(str('button-primary', 'padding') ?? '12px', 'component', 'light', 'Button inline padding');
  const btnRadius = refLeaf(c['button-primary']?.['rounded'], 'rounded');
  button['radius'] = token(btnRadius ? alias(['radius', btnRadius]) : alias(['radius', 'md']), 'component', 'light', 'Button radius');

  const input: DtcgGroup = { $type: 'dimension' };
  input['height'] = token(str('input', 'height') ?? CONTROL_HEIGHT.md, 'component', 'light', 'Input height');
  input['padding-inline'] = token(str('input', 'padding') ?? '12px', 'component', 'light', 'Input inline padding');
  const inputRadius = refLeaf(c['input']?.['rounded'], 'rounded');
  input['radius'] = token(inputRadius ? alias(['radius', inputRadius]) : alias(['radius', 'sm']), 'component', 'light', 'Input radius');

  const dialog: DtcgGroup = { $type: 'dimension' };
  const dialogRadius = refLeaf(c['dialog']?.['rounded'], 'rounded');
  dialog['radius'] = token(dialogRadius ? alias(['radius', dialogRadius]) : alias(['radius', 'lg']), 'component', 'light', 'Dialog radius');
  dialog['padding'] = token(str('dialog', 'padding') ?? '24px', 'component', 'light', 'Dialog padding');
  for (const [k, v] of Object.entries(DIALOG_MAX_WIDTH)) dialog[`max-width-${k}`] = token(v, 'component', 'light', `Dialog max width ${k}`);

  const table: DtcgGroup = { $type: 'dimension' };
  table['header-height'] = token(str('table-header', 'height') ?? CONTROL_HEIGHT.lg, 'component', 'light', 'Table header height');
  table['cell-padding-inline'] = token(str('table-header', 'padding') ?? '12px', 'component', 'light', 'Table cell inline padding');
  for (const [k, v] of Object.entries(TABLE_ROW_HEIGHTS)) table[`row-height-${k}`] = token(v, 'component', 'light', `Table row height ${k}`);

  return { button, input, dialog, table };
}

/**
 * Build the complete DTCG 2025.10 artifact.
 *
 * @param base — the official exporter output (primitive colour base tier).
 * @param doc — the parsed DESIGN.md model (Intent SSOT).
 */
export function buildArtifact(base: JsonObject, doc: DesignDocument): DtcgArtifact {
  const p = buildPrimitives(base, doc);
  const primitive: DtcgGroup = { ...p.leaves, dark: p.dark, hc: p.hc, hcDark: p.hcDark };

  const color: DtcgGroup = {
    $type: 'color',
    primitive,
    semantic: buildSemantics(p),
    component: buildColorComponents(doc),
  };

  const artifact: DtcgArtifact = {
    $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    color,
    space: buildSpace(doc),
    radius: buildRadius(doc),
    border: buildBorder(),
    font: buildFont(doc),
    duration: buildDuration(),
    easing: buildEasing(),
    elevation: buildElevation(p.leaves),
    control: buildControl(),
    target: buildTarget(),
    ...buildComponentGroups(doc),
  };

  return artifact;
}

/** Serialise the artifact to deterministic, 2-space-indented JSON. */
export function serializeArtifact(artifact: DtcgArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/** Public role names for downstream consumers. */
export const SEMANTIC_ROLES: readonly string[] = ROLE_MAP.map((r) => r.role);
