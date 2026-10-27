/**
 * The gallery: every CSF story, in every token mode, mounted at once.
 *
 * This is not a marketing page — it is the fixture host. Each story gets three sections
 * (light, dark, high-contrast), each pinned through the `[data-theme]` cascade the token
 * artifact owns (RESEARCH.md §6.3), so the axe gate and the visual gate see every state in
 * every mode from one URL and cannot be talked into looking away.
 */
import type { ReactNode } from 'react';
import { StoryFrame } from '../csf-runner.js';
import { SECTIONS_BY_COMPONENT, STORY_FIXTURES, STORY_SECTIONS, TOKEN_MODES, type StorySection } from '../story-registry.js';

function SectionHeading(props: { readonly section: StorySection; readonly id: string }): ReactNode {
  const { section, id } = props;
  return (
    <header className="showcase-story__header">
      <h3 className="showcase-story__title" id={id}>
        <span>{section.fixture.displayName}</span>
        <span className="showcase-story__mode">{section.mode}</span>
      </h3>
    </header>
  );
}

/** One story in one mode: the unit the sensors enumerate and name their snapshots by. */
export function StorySectionView(props: { readonly section: StorySection }): ReactNode {
  const { section } = props;
  const headingId = `${section.sectionId}__title`;

  return (
    <section
      className="showcase-story"
      id={section.sectionId}
      data-section-id={section.sectionId}
      data-story-id={section.fixture.storyId}
      data-component={section.fixture.componentId}
      data-mode={section.mode}
      data-theme={section.mode}
      aria-labelledby={headingId}
    >
      <SectionHeading section={section} id={headingId} />
      <StoryFrame fixture={section.fixture} mode={section.mode} />
    </section>
  );
}

export function Gallery(): ReactNode {
  return (
    <div className="showcase-view showcase-gallery">
      <p className="showcase__legend" data-role="fixture-summary">
        {STORY_FIXTURES.length} CSF stories × {TOKEN_MODES.length} token modes = {STORY_SECTIONS.length} sections,
        read from the `@designharness/ui` story modules through their own CSF reader. Each section pins
        `data-theme` for its mode, so light, dark and high contrast all render on this one page.
      </p>

      {SECTIONS_BY_COMPONENT.map(([componentId, sections]) => {
        const groupId = `group-${componentId}`;
        return (
          <section className={`showcase-group showcase-group--${componentId}`} key={componentId} aria-labelledby={groupId}>
            <h2 className="showcase-group__title" id={groupId}>
              {sections[0]?.fixture.title ?? componentId}
              <span className="showcase-group__count">{` ${String(sections.length)} sections`}</span>
            </h2>
            <div className="showcase-group__grid">
              {sections.map((section) => (
                <StorySectionView key={section.sectionId} section={section} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
