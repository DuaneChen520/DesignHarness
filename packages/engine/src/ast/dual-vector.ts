import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface TokenViolation {
  readonly file: string;
  readonly line: number;
  readonly raw: string;
  readonly reason: string;
}

export interface DualVectorReport {
  readonly projectRoot: string;
  readonly hasDesignMarkdown: boolean;
  readonly components: {
    readonly total: number;
    readonly standardized: number;
    readonly legacy: number;
    readonly standardizationRatio: number;
    readonly standardList: readonly string[];
    readonly legacyList: readonly string[];
  };
  readonly tokens: {
    readonly totalClassOccurrences: number;
    readonly semanticTokenOccurrences: number;
    readonly hardcodedOccurrences: number;
    readonly purityRatio: number;
    readonly violations: readonly TokenViolation[];
  };
  readonly healthScore: number;
}

export interface DualVectorOptions {
  readonly projectRoot: string;
  readonly standardComponents?: readonly string[];
  readonly sourceDir?: string;
}

const DEFAULT_STANDARD_NAMES = new Set(['button', 'dialog', 'input', 'combobox', 'data-table', 'datatable']);

/** Recursively collect matching source files. */
function collectFiles(dir: string, extensions: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.turbo', 'coverage', '.git'].includes(entry.name)) continue;
      collectFiles(full, extensions, out);
    } else if (extensions.test(entry.name) && !/\.(test|spec|stories)\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export async function analyzeDualVector(options: DualVectorOptions): Promise<DualVectorReport> {
  const root = options.projectRoot;
  const hasDesignMarkdown = existsSync(join(root, 'DESIGN.md'));
  const srcDir = join(root, options.sourceDir ?? 'src');

  const componentFiles = collectFiles(join(srcDir, 'components'), /\.(tsx|jsx)$/);
  const standardList: string[] = [];
  const legacyList: string[] = [];

  for (const file of componentFiles) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const name = rel.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') ?? '';
    const isUnderUi = rel.includes('/components/ui/');
    const isStandardName = DEFAULT_STANDARD_NAMES.has(name.toLowerCase());

    if (isUnderUi || isStandardName) {
      standardList.push(name);
    } else {
      legacyList.push(name);
    }
  }

  const totalComponents = standardList.length + legacyList.length;
  const standardizationRatio = totalComponents === 0 ? 1 : Number((standardList.length / totalComponents).toFixed(2));

  // Scan for token purity across all source files in src/
  const allSourceFiles = collectFiles(srcDir, /\.(tsx|jsx|ts|js|css)$/);
  const violations: TokenViolation[] = [];
  let semanticTokenOccurrences = 0;
  let hardcodedOccurrences = 0;

  // Regular expressions for hex colors and hardcoded arbitary styling
  const hexPattern = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

  for (const file of allSourceFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const rel = relative(root, file).replaceAll('\\', '/');

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const lineNum = i + 1;

      // Check for inline style hex color
      if (lineText.includes('style={{') && hexPattern.test(lineText)) {
        const matches = lineText.match(hexPattern) ?? [];
        for (const match of matches) {
          hardcodedOccurrences++;
          violations.push({
            file: rel,
            line: lineNum,
            raw: match,
            reason: 'Hardcoded hex color in inline style',
          });
        }
      }

      // Check for arbitrary hex in classes (e.g. text-[#123], bg-[#abc])
      const arbitraryHexMatches = lineText.match(/(?:text|bg|border|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g);
      if (arbitraryHexMatches) {
        for (const match of arbitraryHexMatches) {
          hardcodedOccurrences++;
          violations.push({
            file: rel,
            line: lineNum,
            raw: match,
            reason: 'Arbitrary hex color in class name',
          });
        }
      }

      // Check for raw hex assignments in component definitions
      const constHexMatches = lineText.match(/=\s*['"]#[0-9a-fA-F]{3,8}['"]/g);
      if (constHexMatches && !file.includes('DESIGN.md') && !file.includes('tokens')) {
        for (const match of constHexMatches) {
          hardcodedOccurrences++;
          violations.push({
            file: rel,
            line: lineNum,
            raw: match,
            reason: 'Hardcoded color literal assignment in component',
          });
        }
      }

      // Count semantic token usages
      const semanticMatches = lineText.match(/(?:bg|text|border|ring)-(?:surface|primary|accent|whisper|instrument|signal|sunken|raised|canvas)[a-z0-9-]*/g);
      if (semanticMatches) {
        semanticTokenOccurrences += semanticMatches.length;
      }
    }
  }

  const totalEvaluated = semanticTokenOccurrences + hardcodedOccurrences;
  const purityRatio = totalEvaluated === 0 ? 1 : Number((Math.max(0, totalEvaluated - hardcodedOccurrences) / totalEvaluated).toFixed(2));

  // Health Score: 40% component standardization + 60% token purity
  const healthScore = Math.round(standardizationRatio * 40 + purityRatio * 60);

  return {
    projectRoot: root,
    hasDesignMarkdown,
    components: {
      total: totalComponents,
      standardized: standardList.length,
      legacy: legacyList.length,
      standardizationRatio,
      standardList,
      legacyList,
    },
    tokens: {
      totalClassOccurrences: totalEvaluated,
      semanticTokenOccurrences,
      hardcodedOccurrences,
      purityRatio,
      violations,
    },
    healthScore,
  };
}
