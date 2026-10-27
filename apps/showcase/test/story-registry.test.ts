/**
 * The registry is the sensor's coverage list, so it is asserted before any browser starts.
 *
 * If `@designharness/ui` ever ships a sixth component, drops a story export, or a story stops
 * being renderable from its own `meta`, the Tier-3 a11y count would silently drop and the gate
 * would still be green. These tests are what make that impossible.
 */
import { describe, expect, it } from 'vitest';

import {
  SECTIONS_BY_COMPONENT,
  STORY_FIXTURES,
  STORY_SECTIONS,
  TOKEN_MODES,
  galleryArgs,
  type StoryFixture,
} from '../src/story-registry.js';

/** Component ids, in the order TOKEN-API.md §6 freezes them. */
const EXPECTED_COMPONENTS = ['button', 'input', 'combobox', 'dialog', 'data-table'];

function fixtureOf(storyId: string): StoryFixture {
  const found = STORY_FIXTURES.find((fixture) => fixture.storyId === storyId);
  if (found === undefined) {
    throw new Error(`registry test: story "${storyId}" is not registered, so the sensors would not scan it.`);
  }
  return found;
}

describe('CSF story registry', () => {
  it('covers every frozen component id and nothing else', () => {
    expect(SECTIONS_BY_COMPONENT.map(([componentId]) => componentId)).toEqual(EXPECTED_COMPONENTS);
  });

  it('reads real stories out of the @designharness/ui modules', () => {
    expect(STORY_FIXTURES.length).toBeGreaterThanOrEqual(EXPECTED_COMPONENTS.length * 5);

    for (const componentId of EXPECTED_COMPONENTS) {
      const fixtures = STORY_FIXTURES.filter((fixture) => fixture.componentId === componentId);
      expect(fixtures.length, `${componentId} exports no stories`).toBeGreaterThan(0);
      // DESIGN.md names these states; a component that lost one lost a fixture.
      expect(fixtures.map((fixture) => fixture.exportName)).toEqual(expect.arrayContaining(['Default']));
    }
  });

  it('never registers a story that cannot render', () => {
    for (const fixture of STORY_FIXTURES) {
      const storyRender = typeof fixture.story.render === 'function';
      const metaRender = typeof fixture.meta.render === 'function';
      expect(storyRender || metaRender, `${fixture.title}.${fixture.exportName} has no render`).toBe(true);
      expect(typeof fixture.title).toBe('string');
      expect(fixture.title.startsWith('ui/')).toBe(true);
    }
  });

  it('emits exactly one section per story per token mode, with unique ids', () => {
    expect(TOKEN_MODES).toEqual(['light', 'dark', 'high-contrast']);
    expect(STORY_SECTIONS).toHaveLength(STORY_FIXTURES.length * TOKEN_MODES.length);

    const ids = STORY_SECTIONS.map((section) => section.sectionId);
    expect(new Set(ids).size).toBe(ids.length);

    for (const section of STORY_SECTIONS) {
      expect(section.sectionId).toBe(`${section.fixture.storyId}--${section.mode}`);
      expect(section.sectionId).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('merges meta.args before story.args, the CSF way', () => {
    const secondary = fixtureOf('ui-button--secondary');
    expect(secondary.args['variant']).toBe('secondary');
    expect(secondary.args['size']).toBe('md');
    expect(secondary.args['children']).toBe('Export positions');
  });

  it("keeps the gallery's dialog surfaces non-modal, and only the gallery's", () => {
    const dialog = fixtureOf('ui-dialog--default');
    const button = fixtureOf('ui-button--default');

    expect(galleryArgs(dialog)['modal']).toBe(false);
    expect(galleryArgs(button)['modal']).toBeUndefined();
    // The story's own args are untouched: the fixture host rewrites nothing it reports on.
    expect(dialog.args['modal']).toBeUndefined();
  });
});
