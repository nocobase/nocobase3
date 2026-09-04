// Verifies that every package the server half of a shipped module imports is declared as a runtime dependency.
//
// What makes this a real failure is that server code is deployed unbundled. `pnpm build` emits `dist/server` with its
// bare imports intact and installs a `node_modules` beside it from the generated `dist/package.json`, which is built
// by following `dependencies` alone. A server module importing something declared only as a devDependency therefore
// resolves in every development checkout and is simply absent on the deployed server.
// `@nocobase/app-plugin-workflow` shipped exactly that: `server/loader/source-parser.ts` imports `typescript`, which
// was a devDependency, so a built application crashed on start with `Cannot find package 'typescript'`.
//
// Client code is the opposite and is deliberately not checked. It is bundled by the consuming application's Vite
// build, which resolves those imports at build time and inlines them, so nothing needs to resolve them again at
// runtime. Declaring them as `dependencies` does not help the bundle and does actively cost something: the same
// walk over `dependencies` that builds `dist/package.json` drags every one of them into the server deployment, where
// it is installed and never required. `lucide-react` and `@xyflow/react` alone were 44 MB of exactly that.
//
// So the rule this enforces is narrow on purpose: server imports belong in `dependencies`, and client-only packages
// belong in `devDependencies`. See AGENTS.md, "Declaring Dependencies by How They Are Used".
//
// Only value imports count. `import type` and type-only named bindings are erased before anything runs.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** Groups whose packages ship code to a consumer. Templates are applications; they are the end of the line. */
const CHECKED_GROUPS = ['plugins', 'examples', 'libs', 'app'];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
]);

/**
 * Directories never scanned, whatever a manifest says about them.
 *
 * `dist` is build output whose imports are already accounted for by the sources it was built from. The rest hold
 * tests and fixtures, which are excluded from every package here by its `files` field — their imports of `vitest`
 * and of fixture-only packages are correctly devDependencies.
 */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'tests',
  'e2e',
  'fixtures',
  '__tests__',
  '__fixtures__',
  // Bundled by the consuming application's Vite build, so its imports are resolved and inlined there and never
  // resolved again at runtime. `registry` goes further still: it is shadcn-style source copied into an application
  // and compiled against that application's own `react` and `@/` alias, which the plugin cannot resolve at all.
  'client',
  'registry',
]);

/**
 * Top-level directories a package publishes, derived from `files`.
 *
 * `files` is the authoritative answer to whether code ships, so the scan follows it rather than a list maintained
 * here — tooling that runs from a checkout, such as `app-plugin-workflow`'s `skill-evals`, is excluded because the
 * manifest already excludes it, not because this script knows its name.
 *
 * A package ships `dist` rather than its sources, so the sources that built it are scanned in its place: `dist` is
 * generated from exactly one source root, and reading TypeScript keeps `import type` distinguishable from a value
 * import, which the compiled output no longer is.
 */
const DIST_SOURCE_ROOTS = ['src', 'server', 'database', 'runtime'];

function publishedDirectories(manifest, entries) {
  const files = manifest.files ?? [];
  const shipsDist = files.some(
    (entry) => entry.replace(/^\.\//u, '').split('/')[0] === 'dist',
  );
  const named = new Set(
    files
      .map((entry) => entry.replace(/^\.\//u, '').split('/')[0])
      .filter((entry) => entry && entry !== 'dist'),
  );

  return entries.filter((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry)) return false;
    if (named.has(entry)) return true;
    return shipsDist && DIST_SOURCE_ROOTS.includes(entry);
  });
}

/** A file whose name marks it as tooling or a test rather than shipped code. */
function isExcludedFile(fileName) {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/u.test(fileName) ||
    /\.config\.[cm]?[jt]s$/u.test(fileName) ||
    /\.d\.[cm]?ts$/u.test(fileName)
  );
}

/**
 * The package a specifier resolves to, or `undefined` when nothing has to be declared for it.
 *
 * Relative and absolute paths stay inside the package. `node:`-prefixed specifiers are builtins. Unprefixed builtins
 * such as `fs` and `path` are builtins too — they read like packages but resolve without one, and reporting them
 * would be pure noise. Subpath imports (`#internal`) and the `@/` alias are resolved by the consumer, not here.
 */
function packageNameOf(specifier, builtinModules) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('node:')
  ) {
    return undefined;
  }

  const segments = specifier.split('/');
  const name = specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];

  return builtinModules.has(name) ? undefined : name;
}

/**
 * Value-import specifiers in a source file.
 *
 * Matching is line-oriented for the static forms. An `import`/`export ... from` clause may wrap across lines, but it
 * never contains a blank line or a statement terminator, so the clause pattern excludes both: without that bound a
 * lazy `[\s\S]*?` walks from an unrelated `export interface` all the way to the next `from '...'` several statements
 * later and reports whatever it lands on.
 *
 * Comments and strings are not parsed away, so a specifier mentioned in prose could in principle be picked up. That
 * direction is safe — it reports a dependency to declare rather than hiding one that is missing — but a template
 * literal is not, since its specifier is only known at runtime and cannot name a package to declare.
 */
export function collectRuntimeSpecifiers(source) {
  const specifiers = new Set();

  // The body of an import or export clause: no blank line, no `;`, no `{`/`}` beyond the named-bindings group.
  const clause = String.raw`(?:[^;'"\n]|\n(?!\s*\n))*?`;

  // `import ... from 'x'`, excluding `import type ... from 'x'`.
  for (const match of source.matchAll(
    new RegExp(
      String.raw`(?<![\w$.])import\s+(?!type\s)(${clause})\s+from\s*['"]([^'"]+)['"]`,
      'gu',
    ),
  )) {
    const bindings = /^\{([\s\S]*)\}$/u.exec(match[1].trim());

    // `import { type A, type B } from 'x'` erases entirely, while `import { type A, b }` does not.
    if (bindings) {
      const names = bindings[1]
        .split(',')
        .map((binding) => binding.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((name) => name.startsWith('type '))) {
        continue;
      }
    }

    specifiers.add(match[2]);
  }

  // Side-effect imports, dynamic imports, and require calls. `import(` and `require(` are anchored on their opening
  // parenthesis, so an array of strings such as `['import', 'types']` cannot be mistaken for one.
  for (const pattern of [
    /(?<![\w$.])import\s*['"]([^'"]+)['"]/gu,
    /(?<![\w$.])import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /(?<![\w$.])require\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  // `export ... from 'x'`, which re-exports values unless written as `export type`.
  for (const match of source.matchAll(
    new RegExp(
      String.raw`(?<![\w$.])export\s+(?!type\s)(${clause})\s+from\s*['"]([^'"]+)['"]`,
      'gu',
    ),
  )) {
    specifiers.add(match[2]);
  }

  return specifiers;
}

async function collectSourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(
        ...(await collectSourceFiles(path.join(directory, entry.name))),
      );
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isExcludedFile(entry.name)) continue;
    files.push(path.join(directory, entry.name));
  }

  return files;
}

/**
 * Undeclared runtime imports for one package.
 *
 * `peerDependencies` and `optionalDependencies` count as declared: a peer is provided by the consumer on purpose,
 * which is how every plugin depends on the runtime it plugs into.
 */
export async function findViolations(
  packageDirectory,
  manifest,
  builtinModules,
) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const devDependencies = new Set(Object.keys(manifest.devDependencies ?? {}));

  const entries = (
    await readdir(packageDirectory, { withFileTypes: true })
  ).flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));

  const files = (
    await Promise.all(
      publishedDirectories(manifest, entries).map((directory) =>
        collectSourceFiles(path.join(packageDirectory, directory)),
      ),
    )
  ).flat();

  const offenders = new Map();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const specifier of collectRuntimeSpecifiers(source)) {
      const name = packageNameOf(specifier, builtinModules);
      if (!name || name === manifest.name || declared.has(name)) continue;
      if (!offenders.has(name)) {
        offenders.set(name, path.relative(packageDirectory, file));
      }
    }
  }

  return [...offenders]
    .map(([dependency, file]) => ({
      dependency,
      file,
      kind: devDependencies.has(dependency) ? 'dev-only' : 'undeclared',
    }))
    .sort((left, right) => left.dependency.localeCompare(right.dependency));
}

export async function collectPackages(repositoryRoot) {
  const packages = [];

  for (const group of CHECKED_GROUPS) {
    const groupDirectory = path.join(repositoryRoot, 'packages', group);
    let entries;
    try {
      entries = await readdir(groupDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageDirectory = path.join(groupDirectory, entry.name);
      const manifestPath = path.join(packageDirectory, 'package.json');
      try {
        await stat(manifestPath);
      } catch {
        continue;
      }
      packages.push({
        manifest: JSON.parse(await readFile(manifestPath, 'utf8')),
        manifestPath,
        packageDirectory,
      });
    }
  }

  return packages;
}

function messageFor(violation) {
  return violation.kind === 'dev-only'
    ? `"${violation.dependency}" is imported at runtime by ${violation.file} but declared only in devDependencies, so it is absent wherever this package is installed from a registry`
    : `"${violation.dependency}" is imported at runtime by ${violation.file} but is not declared in dependencies, peerDependencies, or optionalDependencies`;
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const { builtinModules } = await import('node:module');
  const builtins = new Set(builtinModules);
  const packages = await collectPackages(repositoryRoot);
  let failed = false;

  for (const { manifest, manifestPath, packageDirectory } of packages) {
    const violations = await findViolations(
      packageDirectory,
      manifest,
      builtins,
    );
    if (violations.length === 0) continue;

    failed = true;
    const relativePath = path.relative(repositoryRoot, manifestPath);
    console.error(`\n${relativePath} (${manifest.name})`);
    for (const violation of violations) {
      const message = messageFor(violation);
      console.error(`  - ${message}`);
      if (process.env.GITHUB_ACTIONS) {
        console.error(`::error file=${relativePath}::${message}`);
      }
    }
  }

  if (failed) {
    console.error(
      '\nDeclare each one in dependencies, or stop importing it from shipped code.',
    );
    console.error(
      'See AGENTS.md, "Declaring Dependencies by How They Are Used".',
    );
    process.exit(1);
  }

  console.log(
    `Checked ${packages.length} packages — every runtime import is declared.`,
  );
}

if (process.argv[1] === import.meta.filename) {
  await main();
}
