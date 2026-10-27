import stylelint from 'stylelint';

const { createPlugin, utils: { report, ruleMessages, validateOptions } } = stylelint;

/* ------------------------------------------------------------------ *
 * shared helpers
 * ------------------------------------------------------------------ */

/** Values that legitimately carry no token: keywords, zeros, relative units. */
const STRUCTURAL_KEYWORDS = new Set([
  'auto', 'none', 'normal', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
  'transparent', 'currentcolor', 'block', 'inline-block', 'flex', 'grid', 'contents',
  'center', 'left', 'right', 'top', 'bottom', 'baseline', 'stretch', 'nowrap', 'wrap',
  'bold', 'bolder', 'lighter', 'uppercase', 'lowercase', 'capitalize', 'italic', 'oblique',
  'hidden', 'visible', 'collapsed', 'disc', 'decimal', 'pointer', 'default', 'text',
]);

const HEX_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-zA-Z_-])/gi;
const COLOR_FN_RE = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|device-cmyk|color|color-mix|light-dark)\s*\(/gi;
const MATH_FN_RE = /\b(?:calc|clamp|min|max)\s*\((?:[^()]|\([^()]*\))*\)/gi;
const PX_RE = /(?<![\w-])[+-]?(?:\d+\.?\d*|\.?\d+)px\b/gi;

/**
 * Blank out `var(--x, fallback)` / `theme(--y)` chunks with a same-length mask, so literal
 * scanners ignore them while every reported index stays aligned with the original source.
 */
const MASK_CHAR = '\u0001';
function maskCustomPropertyReferences(value) {
  let out = value;
  let previous;
  do {
    previous = out;
    out = out.replace(/\b(?:var|attr|env|theme)\s*\((?:[^()]|\([^()]*\))*\)/gi, (match) =>
      MASK_CHAR.repeat(match.length),
    );
  } while (out !== previous);
  return out;
}

function withoutCustomPropertySyntax(value) {
  return maskCustomPropertyReferences(value)
    .split(MASK_CHAR)
    .join(' ')
    .replace(/"[^"]*"|'[^']*'/g, ' ');
}

/** Slice from the `(` at `openIndex` to its matching `)`, honouring nesting. */
function balancedCall(value, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') {
      depth -= 1;
      if (depth === 0) return value.slice(openIndex, i + 1);
    }
  }
  return value.slice(openIndex);
}

/**
 * A colour function is still hardcoded when it carries bare numeric channels
 * (`rgb(0 0 0)`, `oklch(0.5 0.2 240)`). Token-derived values are not: percentages,
 * `calc()` arithmetic and `from <token>` relative syntax all stay clean.
 */
function hasLiteralChannels(call) {
  const open = call.indexOf('(');
  if (open < 0) return false;
  const inner = call.slice(open + 1, -1);
  const stripped = inner
    .replace(MATH_FN_RE, ' ')
    .split(MASK_CHAR)
    .join(' ');
  return stripped
    .split(/[\s,/]+/)
    .filter(Boolean)
    .some((part) => /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(part));
}

function containsVar(value) {
  return /\b(?:var|theme|attr|env)\s*\(/i.test(value);
}

function namedColorHits(value) {
  const stripped = withoutCustomPropertySyntax(value);
  const words = stripped.split(/[^a-zA-Z]+/).filter(Boolean);
  return words.filter((word) => NAMED_COLORS.has(word.toLowerCase()));
}

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray', 'grey',
  'silver', 'maroon', 'olive', 'lime', 'aqua', 'teal', 'navy', 'fuchsia', 'purple', 'orange',
  'brown', 'pink', 'gold', 'indigo', 'violet', 'turquoise', 'beige', 'ivory', 'khaki', 'plum',
  'salmon', 'coral', 'crimson', 'scarlet', 'amber', 'azure', 'lantern',
]);

/** Properties whose value must come from a token, not an authored literal. */
const TOKEN_PROPS = new Map([
  ['color', 'color'],
  ['caret-color', 'color'],
  ['background', 'color'],
  ['background-color', 'color'],
  ['border', 'color'],
  ['border-top', 'color'],
  ['border-right', 'color'],
  ['border-bottom', 'color'],
  ['border-left', 'color'],
  ['border-color', 'color'],
  ['border-block', 'color'],
  ['border-inline', 'color'],
  ['outline', 'color'],
  ['outline-color', 'color'],
  ['box-shadow', 'shadow'],
  ['text-shadow', 'shadow'],
  ['fill', 'color'],
  ['stroke', 'color'],
  ['accent-color', 'color'],
  ['column-rule', 'color'],
  ['font-family', 'typography'],
  ['font-size', 'typography'],
  ['letter-spacing', 'typography'],
  ['border-radius', 'radius'],
  ['padding', 'space'],
  ['padding-top', 'space'],
  ['padding-right', 'space'],
  ['padding-bottom', 'space'],
  ['padding-left', 'space'],
  ['padding-block', 'space'],
  ['padding-inline', 'space'],
  ['margin', 'space'],
  ['margin-top', 'space'],
  ['margin-right', 'space'],
  ['margin-bottom', 'space'],
  ['margin-left', 'space'],
  ['gap', 'space'],
  ['row-gap', 'space'],
  ['column-gap', 'space'],
  ['transition-duration', 'duration'],
]);

/**
 * A literal value that only uses relative units (%, rem, em, ch, vh, fr, s, ms, deg, turn)
 * is authored-but-portable; we still require a token for tokenized properties.
 */
function isStructuralValue(value) {
  const tokens = withoutCustomPropertySyntax(value).trim().split(/\s+|[,/]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => {
    const lower = token.toLowerCase();
    if (STRUCTURAL_KEYWORDS.has(lower)) return true;
    if (/^[+-]?(?:0(?:\.0+)?)(?:%|rem|em|fr|s|ms|deg|turn|ch)?$/.test(lower)) return true;
    return /^\d+(?:\.\d+)?%$/.test(lower);
  });
}

/* ------------------------------------------------------------------ *
 * rule 1 — harness/no-hardcoded-color
 * ------------------------------------------------------------------ */

const COLOR_RULE = 'harness/no-hardcoded-color';
const COLOR_MESSAGES = ruleMessages(COLOR_RULE, {
  expected: (value) => `Hardcoded color "${value}" is not allowed. Reference a design token, e.g. var(--color-…).`,
});

const colorRule = Object.assign(
  (primary) => {
    return (root, result) => {
      const valid = validateOptions(result, COLOR_RULE, {
        primary,
        secondary: {
          severity: 'string',
          message: COLOR_MESSAGES.expected,
        },
      });
      if (!valid) return;
      if (primary === false) return;

      root.walkDecls((decl) => {
        const candidates = [];
        const value = decl.value;
        const masked = maskCustomPropertyReferences(value);
        const scan = masked.split(MASK_CHAR).join(' ');

        for (const match of scan.matchAll(HEX_RE)) {
          candidates.push({ text: match[0], index: match.index, end: match.index + match[0].length });
        }
        const reportedSpans = [];
        for (const match of scan.matchAll(COLOR_FN_RE)) {
          const open = masked.indexOf('(', match.index);
          const call = balancedCall(masked, open);
          const span = { start: match.index, end: match.index + call.length };
          if (reportedSpans.some((s) => span.start >= s.start && span.end <= s.end)) continue;
          if (!hasLiteralChannels(call)) continue;
          reportedSpans.push(span);
          candidates.push({ text: match[0].trim(), index: match.index, end: span.end });
        }
        for (const word of namedColorHits(value)) {
          const index = scan.toLowerCase().indexOf(word.toLowerCase());
          if (reportedSpans.some((s) => index >= s.start && index <= s.end)) continue;
          candidates.push({ text: word, index, end: index + word.length });
        }

        for (const candidate of candidates) {
          report({
            ruleName: COLOR_RULE,
            result,
            node: decl,
            index: candidate.index,
            endIndex: candidate.end,
            message: COLOR_MESSAGES.expected(candidate.text),
          });
        }
      });
    };
  },
  { ruleName: COLOR_RULE, messages: COLOR_MESSAGES },
);

/* ------------------------------------------------------------------ *
 * rule 2 — harness/no-hardcoded-length (px)
 * ------------------------------------------------------------------ */

const LENGTH_RULE = 'harness/no-hardcoded-length';
const LENGTH_MESSAGES = ruleMessages(LENGTH_RULE, {
  expected: (value) => `Hardcoded pixel length "${value}" is not allowed. Use a spacing/sizing token or a relative unit.`,
});

const lengthRule = Object.assign(
  (primary, secondary) => {
    return (root, result) => {
      const valid = validateOptions(result, LENGTH_RULE, {
        primary,
        secondary: {
          severity: 'string',
          message: LENGTH_MESSAGES.expected,
          ignoreAtRules: 'array',
        },
      });
      if (!valid) return;
      if (primary === false) return;

      const ignoredAtRules = new Set((secondary?.ignoreAtRules ?? []).map((name) => `@${name}`.toLowerCase()));

      const isIgnoredContext = (node) => {
        let parent = node.parent;
        while (parent && parent.type !== 'root') {
          if (parent.type === 'atrule' && ignoredAtRules.has(`@${String(parent.name).toLowerCase()}`)) return true;
          parent = parent.parent;
        }
        return false;
      };

      root.walkDecls((decl) => {
        if (isIgnoredContext(decl)) return;
        const scan = withoutCustomPropertySyntax(decl.value);
        for (const match of scan.matchAll(PX_RE)) {
          if (/^0(\.0+)?px$/i.test(match[0])) continue;
          report({
            ruleName: LENGTH_RULE,
            result,
            node: decl,
            index: match.index,
            endIndex: match.index + match[0].length,
            message: LENGTH_MESSAGES.expected(match[0]),
          });
        }
      });
    };
  },
  { ruleName: LENGTH_RULE, messages: LENGTH_MESSAGES },
);

/* ------------------------------------------------------------------ *
 * rule 3 — harness/no-important
 * ------------------------------------------------------------------ */

const IMPORTANT_RULE = 'harness/no-important';
const IMPORTANT_MESSAGES = ruleMessages(IMPORTANT_RULE, {
  expected: 'Avoid !important — it starts specificity wars and defeats token cascades.',
});

const importantRule = Object.assign(
  (primary) => {
    return (root, result) => {
      const valid = validateOptions(result, IMPORTANT_RULE, { primary, secondary: { severity: 'string' } });
      if (!valid) return;
      if (primary === false) return;

      root.walkDecls((decl) => {
        if (!decl.important) return;
        const text = decl.toString();
        const index = text.lastIndexOf('!important');
        report({
          ruleName: IMPORTANT_RULE,
          result,
          node: decl,
          index: index < 0 ? 0 : index,
          endIndex: index < 0 ? text.length : index + '!important'.length,
          message: IMPORTANT_MESSAGES.expected,
        });
      });
    };
  },
  { ruleName: IMPORTANT_RULE, messages: IMPORTANT_MESSAGES },
);

/* ------------------------------------------------------------------ *
 * rule 4 — harness/prefer-token-reference
 * ------------------------------------------------------------------ */

const TOKEN_RULE = 'harness/prefer-token-reference';
const TOKEN_MESSAGES = ruleMessages(TOKEN_RULE, {
  expected: (property, category) =>
    `"${property}" must reference a ${category} token (var(--…)); authored literals cause design drift.`,
});

const tokenRule = Object.assign(
  (primary) => {
    return (root, result) => {
      const valid = validateOptions(result, TOKEN_RULE, {
        primary,
        secondary: {
          severity: 'string',
          message: TOKEN_MESSAGES.expected,
        },
      });
      if (!valid) return;
      if (primary === false) return;

      root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) return;
        if (decl.parent?.type === 'atrule' && /^(?:keyframes|-webkit-keyframes|theme)$/i.test(decl.parent.name)) return;

        const category = TOKEN_PROPS.get(decl.prop.toLowerCase());
        if (!category) return;
        if (containsVar(decl.value)) return;
        if (isStructuralValue(decl.value)) return;

        report({
          ruleName: TOKEN_RULE,
          result,
          node: decl,
          index: 0,
          endIndex: decl.prop.length + decl.value.length,
          message: TOKEN_MESSAGES.expected(decl.prop, category),
        });
      });
    };
  },
  { ruleName: TOKEN_RULE, messages: TOKEN_MESSAGES },
);

/* ------------------------------------------------------------------ *
 * plugin entry
 * ------------------------------------------------------------------ */

export const ruleName = COLOR_RULE;

export const harnessRules = {
  [COLOR_RULE]: colorRule,
  [LENGTH_RULE]: lengthRule,
  [IMPORTANT_RULE]: importantRule,
  [TOKEN_RULE]: tokenRule,
};

const plugins = [
  createPlugin(COLOR_RULE, colorRule),
  createPlugin(LENGTH_RULE, lengthRule),
  createPlugin(IMPORTANT_RULE, importantRule),
  createPlugin(TOKEN_RULE, tokenRule),
];

export default plugins;
export { COLOR_RULE, LENGTH_RULE, IMPORTANT_RULE, TOKEN_RULE, TOKEN_PROPS, colorRule, lengthRule, importantRule, tokenRule };
