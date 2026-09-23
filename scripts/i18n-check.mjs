import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');

/** The locale every other one is compared against. */
const SOURCE_LOCALE = 'en-US';

const help = `Report translation keys missing from a locale.

Usage:
  pnpm i18n:check [options]

Options:
  --source <locale>   Locale to compare against (default: ${SOURCE_LOCALE})
  --strict            Exit non-zero when a key is missing
  -h, --help          Show this help

Every locales/ directory under packages/ and ui-library/registry/ is checked.
A missing key is reported rather than treated as a failure: an untranslated
string falls back to the source locale, so shipping before a translation lands
is expected.`;

export function parseI18nCheckArgs(args) {
  const options = { help: false, source: SOURCE_LOCALE, strict: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--strict') {
      options.strict = true;
      continue;
    }
    if (argument === '--source') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--source requires a value.');
      }
      options.source = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

/**
 * Every dotted path in a locale object.
 *
 * A branch is not itself a key, so `{ a: { b: 'x' } }` yields `a.b` alone — which is what `t()` addresses.
 */
export function flattenKeys(source, prefix = '') {
  if (!source || typeof source !== 'object') return [];

  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object'
      ? flattenKeys(value, path)
      : [path];
  });
}

async function collectLocaleDirectories(directory, found = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const child = path.join(directory, entry.name);
    if (entry.name === 'locales') {
      found.push(child);
      continue;
    }
    await collectLocaleDirectories(child, found);
  }

  return found;
}

export async function i18nCheck({
  repoRoot = defaultRepoRoot,
  source = SOURCE_LOCALE,
  strict = false,
} = {}) {
  // UI Library items ship their own locale files, which consumers merge into theirs, so they are checked alongside
  // the packages.
  const directories = [];
  for (const root of ['packages', 'ui-library/registry']) {
    await collectLocaleDirectories(path.join(repoRoot, root), directories);
  }
  const reports = [];
  const skipped = [];

  for (const directory of directories) {
    const relativeDirectory = path.relative(repoRoot, directory);
    const files = (await readdir(directory)).filter((file) =>
      LOCALE_FILE.test(file),
    );
    const sourceFile = files.find((file) => file === `${source}.ts`);
    if (!sourceFile) continue;

    const sourceLocale = parseLocaleObject(
      await readFile(path.join(directory, sourceFile), 'utf8'),
    );
    if (sourceLocale[UNRESOLVED]) {
      skipped.push(path.join(relativeDirectory, sourceFile));
      continue;
    }
    const sourceKeys = new Set(comparableKeys(sourceLocale));

    for (const file of files) {
      if (file === sourceFile) continue;
      const locale = path.basename(file, '.ts');
      const parsed = parseLocaleObject(
        await readFile(path.join(directory, file), 'utf8'),
      );
      if (parsed[UNRESOLVED]) {
        skipped.push(path.join(relativeDirectory, file));
        continue;
      }
      const keys = new Set(comparableKeys(parsed));
      const missing = [...sourceKeys].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !sourceKeys.has(key));

      if (missing.length > 0 || extra.length > 0) {
        reports.push({
          directory: relativeDirectory,
          locale,
          missing,
          extra,
        });
      }
    }
  }

  return { reports, skipped, strict };
}

/**
 * A locale file is named for its locale, such as `en-US.ts` or `zh-Hans-CN.ts`. Anything else in a `locales/`
 * directory — its `index.ts`, or a hook that reads the resources — is not a locale.
 */
const LOCALE_FILE =
  /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?\.ts$/;

/** The suffixes i18next adds for plural forms. Languages use different sets of them, so they are compared by base key. */
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

/**
 * The keys a locale is compared on. A top-level `overrides` block rewords another package's copy and is allowed in
 * any locale without appearing in the source one, so it is left out. Plural forms collapse to their base key: Chinese
 * has only `_other` where English has `_one` and `_other`, and neither is missing anything.
 */
function comparableKeys(locale) {
  return [
    ...new Set(
      flattenKeys(locale)
        .filter((key) => key !== 'overrides' && !key.startsWith('overrides.'))
        .map((key) => key.replace(PLURAL_SUFFIX, '')),
    ),
  ];
}

/**
 * Set on a parsed locale whose keys cannot all be read from its own source, such as one built by spreading another
 * object. Comparing against it would report every key the spread supplies, so the check skips the file instead.
 */
export const UNRESOLVED = Symbol('unresolved');

/** The start of a value that is its own leaf: a string, a number, or a boolean. */
const LITERAL_VALUE = /^(?:['"`\d-]|true\b|false\b)/;

/**
 * Recovers the key structure of a locale file as plain data.
 *
 * The file cannot simply be imported: it is TypeScript, and it may import a type from its sibling. What matters here
 * is only which keys exist, so the object literal is read structurally and every leaf becomes an empty string. Keys
 * may be identifiers or quoted strings, including the dotted `'auth.signIn'` form.
 */
export function parseLocaleObject(contents) {
  const code = stripComments(contents);
  const root = {};
  let index = findLocaleObjectStart(code);
  // No literal to read, as in a file that re-exports another locale.
  if (index === undefined) {
    root[UNRESOLVED] = true;
    return root;
  }

  const stack = [root];
  let pendingKey;

  while (index < code.length && stack.length > 0) {
    const character = code[index];
    const current = stack[stack.length - 1];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    // Reading a value: a nested object opens a group, and a literal is a leaf whose content does not matter here. A
    // reference to another constant may stand for a whole group of keys, which this reader cannot see.
    if (pendingKey !== undefined) {
      if (character === '{') {
        const child = {};
        current[pendingKey] = child;
        stack.push(child);
        index += 1;
      } else {
        if (!LITERAL_VALUE.test(code.slice(index, index + 6))) {
          root[UNRESOLVED] = true;
        }
        current[pendingKey] = '';
        index = skipExpression(code, index);
      }
      pendingKey = undefined;
      continue;
    }

    // Reading a key, or the end of the object.
    if (character === ',') {
      index += 1;
      continue;
    }
    if (character === '}') {
      stack.pop();
      index += 1;
      continue;
    }
    // A spread or a computed key brings in keys this reader cannot see.
    if (code.startsWith('...', index) || character === '[') {
      root[UNRESOLVED] = true;
      index = skipExpression(code, index);
      continue;
    }
    if (character === "'" || character === '"') {
      const end = findStringEnd(code, index);
      const colon = skipWhitespace(code, end + 1);
      if (code[colon] === ':') {
        pendingKey = code.slice(index + 1, end).replace(/\\(.)/g, '$1');
        index = colon + 1;
      } else {
        index = end + 1;
      }
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/.exec(code.slice(index));
    if (identifier) {
      const next = skipWhitespace(code, index + identifier[0].length);
      if (code[next] === ':') {
        pendingKey = identifier[0];
        index = next + 1;
      } else if (code[next] === ',' || code[next] === '}') {
        // Shorthand property.
        current[identifier[0]] = '';
        index = next;
      } else {
        index = skipExpression(code, index);
      }
      continue;
    }

    index += 1;
  }

  return root;
}

/**
 * Where the object literal holding the locale begins: either the default export itself, or the declaration of the
 * constant it names. Anchoring on the default export is what tells the value apart from an interface above it that
 * declares the same shape.
 */
function findLocaleObjectStart(code) {
  const literal = /export\s+default\s*\{/.exec(code);
  if (literal) return literal.index + literal[0].length;

  const exported = /export\s+default\s+([A-Za-z_$][\w$]*)/.exec(code);
  const name = exported
    ? exported[1].replaceAll('$', '\\$')
    : '[A-Za-z_$][\\w$]*';
  const declaration = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`,
  ).exec(code);
  return declaration ? declaration.index + declaration[0].length : undefined;
}

/**
 * Removes comments without touching string contents, so a `//` inside a URL is not taken for the start of one.
 */
function stripComments(contents) {
  let code = '';
  let index = 0;

  while (index < contents.length) {
    const character = contents[index];
    if (character === "'" || character === '"' || character === '`') {
      const end = findStringEnd(contents, index);
      code += contents.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (contents.startsWith('//', index)) {
      const end = contents.indexOf('\n', index);
      index = end === -1 ? contents.length : end;
      continue;
    }
    if (contents.startsWith('/*', index)) {
      const end = contents.indexOf('*/', index + 2);
      code += ' ';
      index = end === -1 ? contents.length : end + 2;
      continue;
    }
    code += character;
    index += 1;
  }

  return code;
}

/** The index of the `,` or `}` that ends the expression starting at `start`, at the same nesting depth. */
function skipExpression(code, start) {
  let depth = 0;
  let index = start;

  while (index < code.length) {
    const character = code[index];
    if (character === "'" || character === '"' || character === '`') {
      index = findStringEnd(code, index) + 1;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) return index;
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      return index;
    }
    index += 1;
  }

  return index;
}

function skipWhitespace(code, start) {
  let index = start;
  while (index < code.length && /\s/.test(code[index])) index += 1;
  return index;
}

function findStringEnd(contents, start) {
  const quote = contents[start];
  let index = start + 1;
  while (index < contents.length) {
    if (contents[index] === '\\') {
      index += 2;
      continue;
    }
    if (contents[index] === quote) return index;
    index += 1;
  }
  return contents.length;
}

async function main() {
  let options;
  try {
    options = parseI18nCheckArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(help);
    return;
  }

  const { reports, skipped } = await i18nCheck(options);

  for (const file of skipped) {
    console.log(`skipped: ${file} (its keys are not all written out)`);
  }

  if (reports.length === 0) {
    console.log('Every locale matches the source locale.');
    return;
  }

  for (const report of reports) {
    console.log(`\n${report.directory} — ${report.locale}`);
    for (const key of report.missing) console.log(`  missing: ${key}`);
    for (const key of report.extra) console.log(`  unknown: ${key}`);
  }

  const missingCount = reports.reduce(
    (total, report) => total + report.missing.length,
    0,
  );
  const extraCount = reports.reduce(
    (total, report) => total + report.extra.length,
    0,
  );
  console.log(
    `\n${missingCount} missing and ${extraCount} unknown key(s) across ${reports.length} locale(s).`,
  );

  if (options.strict) process.exitCode = 1;
}

if (process.argv[1] === scriptPath) {
  await main();
}
