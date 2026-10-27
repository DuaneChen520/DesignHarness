/**
 * One story, alone, on a page of its own — with its **authentic** args.
 *
 * The gallery has to render every state at the same time, which forces one compromise: its
 * dialog sections are mounted non-modally, because a modal that hides the rest of the page
 * from assistive technology cannot coexist with a hundred and four other sections. This route
 * has no such constraint. `/story?story=ui-dialog--open` mounts the story exactly as CSF
 * declares it, so the modal contract — `aria-modal`, the scrim, the focus trap, the inert
 * background — is measurable as the design system actually ships it.
 */
import type { ReactNode } from 'react';
import { renderStory, type FixtureContext } from '../csf-runner.js';
import { TOKEN_MODES, STORY_FIXTURES, type StoryFixture, type TokenMode } from '../story-registry.js';

const MAX_ATTEMPTS_MESSAGE = 'story parameter selects a CSF story that does not exist';

function findFixture(storyId: string): StoryFixture | undefined {
  return STORY_FIXTURES.find((fixture) => fixture.storyId === storyId);
}

function findMode(raw: string | null): TokenMode {
  return TOKEN_MODES.find((mode) => mode === raw) ?? 'light';
}

export function IsolatedStoryView(): ReactNode {
  const params = new URLSearchParams(window.location.search);
  const storyId = params.get('story') ?? '';
  const mode = findMode(params.get('mode'));
  const fixture = findFixture(storyId);

  if (fixture === undefined) {
    return (
      <div className="showcase-view">
        <h2 className="showcase-view__title">Unknown story</h2>
        <p data-role="story-error">
          {MAX_ATTEMPTS_MESSAGE}: `{storyId}`. Registered ids: {STORY_FIXTURES.map((entry) => entry.storyId).join(', ')}
        </p>
      </div>
    );
  }

  const context: FixtureContext = {
    name: fixture.displayName,
    storyName: fixture.displayName,
    viewMode: 'story',
    mode,
  };

  return (
    <div className="showcase-view">
      <h2 className="showcase-view__title">
        {fixture.title} · {fixture.displayName}
      </h2>
      <section
        className="showcase-story"
        id={`isolated-${fixture.storyId}`}
        data-section-id={`isolated-${fixture.storyId}`}
        data-story-id={fixture.storyId}
        data-component={fixture.componentId}
        data-mode={mode}
        data-theme={mode}
        aria-label={`Isolated story ${fixture.title} ${fixture.displayName} in ${mode} mode`}
      >
        <div className="showcase-story__frame">{renderStory(fixture, context)}</div>
      </section>
    </div>
  );
}
