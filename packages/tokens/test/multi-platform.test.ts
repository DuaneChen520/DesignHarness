import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { freshBuildRoot, packageRoot } from './helpers/pipeline.js';

interface Tree {
  readonly label: string;
  readonly root: string;
}

const TREES: Tree[] = [];

beforeAll(() => {
  const fresh = freshBuildRoot();
  for (const [label, root] of [['fresh', fresh], ['package', packageRoot]] as const) {
    if (existsSync(join(root, 'dist/scss/_tokens.scss'))) {
      TREES.push({ label, root });
    }
  }
  expect(TREES.length, 'multi-platform tokens were not generated').toBeGreaterThan(0);
});

describe('Multi-Platform Token Compilation (SCSS, Compose, Swift)', () => {
  it('generates non-empty SCSS with flat $color-* variables and structured $tokens map', () => {
    for (const tree of TREES) {
      const scss = readFileSync(join(tree.root, 'dist/scss/_tokens.scss'), 'utf8');
      expect(scss.length).toBeGreaterThan(100);
      expect(scss).toContain('$color-primary:');
      expect(scss).toContain('$color-canvas:');
      expect(scss).toContain('$tokens: (');
      expect(scss).toContain('"color-primary": $color-primary');
      expect(scss).toContain('"space-md": $space-md');
    }
  });

  it('generates non-empty Kotlin Compose Color.kt with androidx.compose.ui.graphics.Color', () => {
    for (const tree of TREES) {
      const compose = readFileSync(join(tree.root, 'dist/compose/Color.kt'), 'utf8');
      expect(compose.length).toBeGreaterThan(100);
      expect(compose).toContain('package com.designharness.tokens');
      expect(compose).toContain('import androidx.compose.ui.graphics.Color');
      expect(compose).toContain('object Color {');
      expect(compose).toContain('val Primary = Color(0xFF1A5FD0)');
      expect(compose).toContain('val PrimitiveCanvas = Color(');
      // Valid hex format 0x followed by 8 hex digits
      const hexMatches = compose.match(/Color\(0x[0-9A-Fa-f]{8}\)/g);
      expect(hexMatches).not.toBeNull();
      expect(hexMatches!.length).toBeGreaterThan(10);
    }
  });

  it('generates non-empty Swift ColorAsset.swift extending SwiftUI.Color with static properties', () => {
    for (const tree of TREES) {
      const swift = readFileSync(join(tree.root, 'dist/swift/ColorAsset.swift'), 'utf8');
      expect(swift.length).toBeGreaterThan(100);
      expect(swift).toContain('import SwiftUI');
      expect(swift).toContain('public extension Color {');
      expect(swift).toContain('static let primary = Color(');
      expect(swift).toContain('static let primitiveCanvas = Color(');
      // Valid sRGB components
      expect(swift).toMatch(/red:\s*[\d.]+\s*,\s*green:\s*[\d.]+\s*,\s*blue:\s*[\d.]+/);
    }
  });
});
