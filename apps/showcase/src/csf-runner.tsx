/**
 * The CSF runner: renders a story the way a CSF-aware tool would, from the module data
 * only (RESEARCH.md §5.1.2 — stories double as the automated-test fixtures).
 *
 * Merge order is the CSF order: `meta.args` overlaid by `story.args`; `render` is the
 * story's when it has one and the meta's otherwise; decorators compose meta-outer /
 * story-inner. Nothing here re-types a prop, supplies a default or guesses a state — if a
 * story cannot render, the runner throws, because a fixture host that renders an empty
 * rectangle is the worst possible sensor.
 */
import type { ReactNode } from 'react';
import type { StoryComponent, StoryContext } from '../../../packages/ui/dist/testing/csf.js';
import { galleryArgs, type StoryFixture, type TokenMode } from './story-registry.js';

/** The runner's view of a `StoryContext`, trimmed to what the harness stories read. */
export interface FixtureContext {
  readonly name: string;
  readonly storyName: string;
  readonly viewMode: 'story';
  readonly mode: TokenMode;
}

type RenderFn = (args: Record<string, unknown>, context: StoryContext) => ReactNode;
type DecoratorFn = (Story: StoryComponent, context: StoryContext, args: Record<string, unknown>) => ReactNode;

const asFunction = <T,>(value: unknown): T | undefined => (typeof value === 'function' ? (value as T) : undefined);

const decoratorList = (value: unknown): readonly DecoratorFn[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asFunction<DecoratorFn>(entry))
    .filter((entry): entry is DecoratorFn => entry !== undefined);
};

/** Render one fixture's markup, decorators applied. */
export function renderStory(fixture: StoryFixture, context: FixtureContext, args?: Record<string, unknown>): ReactNode {
  const storyRender = asFunction<RenderFn>(fixture.story.render);
  const metaRender = asFunction<RenderFn>(fixture.meta.render);
  const render = storyRender ?? metaRender;

  if (render === undefined) {
    throw new Error(
      `CSF runner: ${fixture.title}.${fixture.exportName} has no render function and the meta declares none, ` +
        `so the fixture host would mount an empty section for it.`,
    );
  }

  const scopedArgs = args ?? fixture.args;
  const runnerContext: StoryContext = { name: context.name, storyName: context.storyName, viewMode: 'story' };

  let node: ReactNode = render(scopedArgs, runnerContext);

  // Story decorators wrap the render first, then meta decorators wrap those: meta outermost.
  for (const decorator of [...decoratorList(fixture.meta.decorators), ...decoratorList(fixture.story.decorators)].reverse()) {
    const inner = node;
    node = decorator(() => inner, runnerContext, scopedArgs);
  }

  return node;
}

/** The story frame: a bordered, mode-pinned mount point for one rendered story. */
export function StoryFrame(props: { readonly fixture: StoryFixture; readonly mode: TokenMode }): ReactNode {
  const { fixture, mode } = props;
  const context: FixtureContext = {
    name: fixture.displayName,
    storyName: fixture.displayName,
    viewMode: 'story',
    mode,
  };
  return <div className="showcase-story__frame">{renderStory(fixture, context, galleryArgs(fixture))}</div>;
}
