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

Every locales/ directory under packages/ is checked. A missing key is reported
rather than treated as a failure: an untranslated string falls back to the
source locale, so shipping before a translation lands is expected.`;

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
  const packagesDirectory = path.join(repoRoot, 'packages');
  const directories = await collectLocaleDirectories(packagesDirectory);
  const reports = [];

  for (const directory of directories) {
    const files = (await readdir(directory)).filter(
      (file) => file.endsWith('.ts') && file !== 'index.ts',
    );
    const sourceFile = files.find((file) => file === `${source}.ts`);
    if (!sourceFile) continue;

    const sourceKeys = new Set(
      flattenKeys(
        parseLocaleObject(
          await readFile(path.join(directory, sourceFile), 'utf8'),
        ),
      ),
    );

    for (const file of files) {
      if (file === sourceFile) continue;
      const locale = path.basename(file, '.ts');
      const keys = new Set(
        flattenKeys(
          parseLocaleObject(await readFile(path.join(directory, file), 'utf8')),
        ),
      );
      const missing = [...sourceKeys].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !sourceKeys.has(key));

      if (missing.length > 0 || extra.length > 0) {
        reports.push({
          directory: path.relative(repoRoot, directory),
          locale,
          missing,
          extra,
        });
      }
    }
  }

  return { reports, strict };
}

/**
 * Recovers the key structure of a locale file as plain data.
 *
 * The file cannot simply be imported: it is TypeScript, and it may import a type from its sibling. What matters here
 * is only which keys exist, so the object literal is read structurally and every leaf becomes an empty string.
 */
export function parseLocaleObject(contents) {
  const withoutComments = contents
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // The value, not the interface that may sit above it declaring the same shape. Anchoring on the declaration whose
  // name the file default-exports is what tells them apart.
  const exported = /export\s+default\s+([A-Za-z_$][\w$]*)/.exec(
    withoutComments,
  );
  const declaration = exported
    ? new RegExp(
        `(?:const|let|var)\\s+${exported[1]}\\s*(?::[^=]+)?=\\s*\\{`,
      ).exec(withoutComments)
    : /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*\{/.exec(
        withoutComments,
      );
  if (!declaration) return {};

  const root = {};
  const stack = [root];
  let index = declaration.index + declaration[0].length;
  let pendingKey;

  while (index < withoutComments.length && stack.length > 0) {
    const character = withoutComments[index];

    if (character === '{') {
      if (pendingKey) {
        const child = {};
        stack[stack.length - 1][pendingKey] = child;
        stack.push(child);
        pendingKey = undefined;
      }
      index += 1;
      continue;
    }
    if (character === '}') {
      stack.pop();
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      const end = findStringEnd(withoutComments, index);
      if (pendingKey) {
        stack[stack.length - 1][pendingKey] = '';
        pendingKey = undefined;
      }
      index = end + 1;
      continue;
    }

    const keyMatch = /^(['"]?)([A-Za-z_$][\w$]*)\1\s*:/.exec(
      withoutComments.slice(index),
    );
    if (keyMatch) {
      pendingKey = keyMatch[2];
      index += keyMatch[0].length;
      continue;
    }

    index += 1;
  }

  return root;
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

  const { reports } = await i18nCheck(options);

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
