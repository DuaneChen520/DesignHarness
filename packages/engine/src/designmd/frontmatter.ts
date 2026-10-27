/**
 * Minimal, self-owned YAML front-matter splitter for DESIGN.md files.
 *
 * The harness deliberately does NOT reuse the design.md linter's parser here: we
 * need the raw front-matter object (independent of the linter's typed model) to
 * drive our own reference resolution and DTCG synthesis, and we want a splitter
 * that is robust to the file starting with a BOM or CRLF line endings.
 */

/** Result of splitting a document into front matter and body. */
export interface SplitResult {
  /** Raw YAML text between the delimiters, without the fences. Empty if none. */
  readonly frontMatter: string;
  /** Everything after the closing fence. */
  readonly body: string;
  /** Whether a front matter block was present. */
  readonly present: boolean;
}

/**
 * Split leading YAML front matter delimited by `---` fences. Tolerates a leading
 * BOM and CRLF endings. When there is no front matter, returns the whole input as
 * `body` with `present: false`.
 */
export function splitFrontMatter(md: string): SplitResult {
  const text = md.replace(/^\uFEFF/, '');
  // Normalise line endings for detection but keep original body content intact.
  const firstBreak = text.indexOf('\n');
  const firstLine = firstBreak === -1 ? text : text.slice(0, firstBreak);
  if (firstLine.trim() !== '---') {
    return { frontMatter: '', body: text, present: false };
  }
  const afterOpen = firstBreak === -1 ? text.length : firstBreak + 1;
  // Find the closing fence on its own line.
  const closing = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/.exec(text.slice(afterOpen));
  if (!closing) {
    // Unterminated front matter: treat everything after the open fence as YAML.
    return { frontMatter: text.slice(afterOpen), body: '', present: true };
  }
  const frontMatter = text.slice(afterOpen, afterOpen + (closing.index === 0 ? 0 : closing.index));
  const rest = text.slice(afterOpen + closing[0].length);
  return { frontMatter, body: rest, present: true };
}
