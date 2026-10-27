import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractComponentMetadata } from '../src/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/Button.tsx', import.meta.url));

describe('extractComponentMetadata (ts-morph)', () => {
  it('extracts props, defaults, descriptions, deprecation and events', async () => {
    const entries = await extractComponentMetadata({ sourceFiles: [FIXTURE] });
    expect(entries).toHaveLength(1);
    const button = entries[0]!;

    expect(button.name).toBe('Button');
    expect(button.id).toBe('button');
    expect(button.sourceFile).toContain('Button.tsx');

    const byName = new Map(button.props.map((p) => [p.name, p]));

    // required label, optional rest
    expect(byName.get('label')?.required).toBe(true);
    expect(byName.get('label')?.type).toBe('string');
    expect(byName.get('variant')?.required).toBe(false);
    expect(byName.get('disabled')?.type).toBe('boolean');

    // readable union resolution: either the alias name or a literal union
    const variantType = byName.get('variant')?.type ?? '';
    expect(/ButtonVariant|primary/.test(variantType)).toBe(true);

    // defaults from destructuring initializer + defaultProps
    expect(byName.get('size')?.default).toBe("'md'");
    expect(byName.get('variant')?.default).toBe("'primary'");
    expect(byName.get('disabled')?.default).toBe('true');

    // JSDoc descriptions
    expect(byName.get('label')?.description).toMatch(/label/i);

    // @deprecated note
    expect(byName.get('width')?.deprecation).toBeDefined();
    expect(byName.get('width')?.deprecation).toMatch(/size/i);

    // events are split out and NOT in props
    const eventNames = button.events.map((e) => e.name);
    expect(eventNames).toContain('onClick');
    expect(eventNames).toContain('onFocus');
    expect(byName.has('onClick')).toBe(false);
    expect(byName.get('onClick')).toBeUndefined();
    const onClick = button.events.find((e) => e.name === 'onClick');
    expect(onClick?.signature).toMatch(/=>/);
  });

  it('honours an explicit displayName override', async () => {
    const entries = await extractComponentMetadata({ sourceFiles: [FIXTURE], displayName: 'MeridianButton' });
    expect(entries[0]?.name).toBe('MeridianButton');
    expect(entries[0]?.id).toBe('button');
  });
});
