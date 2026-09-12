// Fails the build when something this application's own server or CLI code imports would not be usable in a
// deployment.
//
// `dist/package.json` is generated from `dependencies` and is what a deployment installs from, so a package a
// server module imports but declares as a devDependency resolves in every development checkout and is absent
// exactly once — on the deployed server, as `Cannot find module` naming a package whose declaration looks
// perfectly correct.
//
// Client packages are deliberately not in that tree: plugins declare them as peer dependencies so an application
// installs one shared copy for its Vite build, while `dist` opts out of peers entirely. A server module importing
// one of those is the same mistake in the other direction, and this catches it too.
//
// Only the application's own source is scanned. A plugin's imports are that plugin's contract with its own
// manifest, checked by `pnpm deps:check` at the repository root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJson } from './server-deps.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const distDir = path.join(rootDir, 'dist');
const nodeModulesDir = path.join(distDir, 'node_modules');

/** Source roots holding code that runs in a deployment, as opposed to code the client build inlines. */
const RUNTIME_SOURCE_DIRS = ['server', 'database', 'cli'];

/**
 * Directories inside those roots that a deployment never runs.
 *
 * `cli/dev-commands/` reads client declarations through Vite and the browser client, neither of which exists in a
 * server deployment. `cli/index.ts` loads it through a specifier assembled at run time precisely so the build does
 * not follow it, and resolves it to an empty object when running from compiled output — so its imports are
 * correctly absent from `dist`, and reporting them would be a false alarm on every build.
 */
const EXCLUDED_SOURCE_DIRS = new Set(['dev-commands']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs']);

/**
 * Value-import specifiers in a source file.
 *
 * Type-only imports are excluded because they are erased before anything runs; a package imported only for its
 * types is correctly absent from a deployment. Matching is deliberately simple — over-reporting a specifier that
 * appears in a comment costs a false alarm, while missing one costs a broken deployment.
 */
function collectSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?<![\w$.])import\s+(?!type\s)(?:[^;'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /(?<![\w$.])import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /(?<![\w$.])require\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /(?<![\w$.])export\s+(?!type\s)[^;'"\n]*?\s+from\s+['"]([^'"]+)['"]/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

const packageNameOf = (specifier) => {
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
  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
};

function collectSourceFiles(directory, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      EXCLUDED_SOURCE_DIRS.has(entry.name)
    ) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(entryPath, found);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)))
      found.push(entryPath);
  }
  return found;
}

/**
 * How a package fares in the deployment, as a reason string, or `undefined` when it is fine.
 *
 * `dist/package.json` is what a deployment installs from, so a package missing there is absent on the server
 * however much of it happens to sit in the local tree — a transitive dependency of something else can leave a
 * package fully present here and entirely absent after a real deploy. Checking the installed directory as well
 * catches the case where the manifest lists it but the install did not produce it.
 */
function deploymentProblem(packageName, distDependencies) {
  if (!Object.hasOwn(distDependencies, packageName)) {
    return 'not listed in dist/package.json, so a deployment install will not fetch it';
  }

  const packageDir = path.join(nodeModulesDir, packageName);
  if (!fs.existsSync(packageDir)) return 'absent from dist/node_modules';

  let count = 0;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
      else count += 1;
    }
  };
  walk(packageDir);

  return count <= 1
    ? 'installed as a bare manifest, so nothing it exports can load'
    : undefined;
}

if (!fs.existsSync(nodeModulesDir)) {
  console.error('Missing dist/node_modules. Run pnpm build first.');
  process.exit(1);
}

const builtinModules = new Set(
  (await import('node:module')).builtinModules ?? [],
);

const imported = new Set();
for (const sourceDir of RUNTIME_SOURCE_DIRS) {
  for (const file of collectSourceFiles(path.join(rootDir, sourceDir))) {
    for (const specifier of collectSpecifiers(fs.readFileSync(file, 'utf8'))) {
      const name = packageNameOf(specifier);
      if (name && !builtinModules.has(name)) imported.add(name);
    }
  }
}

const distDependencies =
  readJson(path.join(distDir, 'package.json')).dependencies ?? {};

const rootDependencies =
  readJson(path.join(rootDir, 'package.json')).dependencies ?? {};

const problems = [];
for (const name of [...imported].sort()) {
  // Checked against the application's own manifest first, and separately from whether the package reaches `dist`.
  //
  // Inside this repository a package can reach `dist/package.json` without being declared here at all: workspace
  // packages are vendored transitively, so `@nocobase/db` arrives as a dependency of `@nocobase/app-server` and the
  // manifest check below passes. An application generated by `create-app` has no vendoring — every dependency comes
  // from its own manifest — so the same misdeclaration fails there, at `pnpm build`, in someone else's project.
  //
  // That is exactly what happened: `@nocobase/db` and `@nocobase/service-provider` sat in `devDependencies` in two
  // templates, verified clean on every build here, and failed the first time an application was generated from them.
  if (!Object.hasOwn(rootDependencies, name)) {
    problems.push([
      name,
      'imported by server code but not in this application\'s "dependencies"',
    ]);
    continue;
  }

  const reason = deploymentProblem(name, distDependencies);
  if (reason) problems.push([name, reason]);
}

if (problems.length === 0) {
  console.log(
    `Verified ${imported.size} package(s) imported by server, database, and CLI code — all reach the deployment.`,
  );
  process.exit(0);
}

console.error(
  'Packages your server code imports will not be usable in a deployment:\n',
);
for (const [name, reason] of problems) {
  console.error(`  ${name} — ${reason}`);
}
console.error(
  '\nA package your server imports belongs in "dependencies". `dist/package.json` is generated from there, and\n' +
    'it is what a deployment installs from, so a devDependency is absent on the server however complete the local\n' +
    'tree looks.\n\n' +
    'A client-only package is the other way round: plugins declare those as peer dependencies and `dist` does not\n' +
    'install peers, so importing one from server code will not work in a deployment.',
);
process.exit(1);
