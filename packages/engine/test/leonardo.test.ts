import { describe, expect, it } from 'vitest';
import { evaluateToneScale, generateToneScale } from '../src/index.js';

const hx = (h: string): string => `#${h}`;

describe('Leonardo tone scale (wcag2)', () => {
  it('generates an ordered, in-range ramp from the brand seed', () => {
    const scale = generateToneScale(hx('1A5FD0'), hx('FFFFFF'), 9);
    expect(scale.steps).toHaveLength(9);
    // Lightest end (toward white) has near-1 contrast; darkest end is a strong contrast.
    const lightest = scale.steps[0];
    const darkest = scale.steps[8];
    expect(lightest?.contrast).toBeCloseTo(1, 0);
    expect((darkest?.contrast ?? 0)).toBeGreaterThan(lightest?.contrast ?? 0);
    for (const step of scale.steps) {
      expect(step.rgb.every((ch) => ch >= 0 && ch <= 255)).toBe(true);
    }
  });

  it('evaluates which tone steps clear AA / large thresholds', () => {
    const scale = generateToneScale(hx('1A5FD0'), hx('FFFFFF'), 11);
    const evaluated = evaluateToneScale(scale);
    expect(evaluated.largeIndices.length).toBeGreaterThanOrEqual(evaluated.aaIndices.length);
  });
});
