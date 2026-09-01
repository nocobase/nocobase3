// Verifies that packages depend on identity-sensitive workspace packages through peerDependencies rather than
// dependencies.
//
// An identity-sensitive package carries runtime state whose behavior depends on the module instance being unique in a
// process: a `ServiceToken` is compared by object identity in `ServiceContainer`'s `Map`, a React context object only
// matches the provider created from the same module, and `@nocobase/queue` registers job classes into the global
// `Locator` of `@boringnode/queue`. Two copies of such a package silently split that state.
//
// The monorepo hides the problem because `workspace:` links every consumer to one directory. It surfaces only after
// publishing, when a package manager is free to install a second copy to satisfy a `dependencies` range — no warning
// at install time, a missing service or an undefined context at runtime in a customer's application.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Packages whose runtime identity must be unique in a process. The reason is recorded per package because the
// remedy — moving the entry to peerDependencies — otherwise looks like arbitrary bookkeeping.
export const IDENTITY_SENSITIVE_PACKAGES = new Map([
  [
    '@nocobase/service-provider',
    'ServiceToken objects are compared by identity in the service container',
  ],
  ['@nocobase/db', 'exports databaseManagerToken and migration identity'],
  [
    '@nocobase/app-server',
    'exports the service tokens every server plugin resolves against',
  ],
  ['@nocobase/app-client', 'exports React contexts and appApiClientToken'],
  ['@nocobase/app-portal-sdk', 'exports the nocobaseClient module singleton'],
  ['@nocobase/i18n', 'exports React contexts for the i18n runtime'],
  [
    '@nocobase/queue',
    'registers job classes into the global Locator of @boringnode/queue',
  ],
]);

/** Plugins export service tokens for one another, so a plugin-to-plugin dependency carries the same risk. */
export function isIdentitySensitive(packageName) {
  return (
    IDENTITY_SENSITIVE_PACKAGES.has(packageName) ||
    packageName.startsWith('@nocobase/app-plugin-')
  );
}

export function reasonFor(packageName) {
  return (
    IDENTITY_SENSITIVE_PACKAGES.get(packageName) ??
    'plugins export service tokens that consumers resolve by object identity'
  );
}

/**
 * Violations for a single manifest.
 *
 * A peer dependency on a workspace package also needs a devDependency on the same package, or the package cannot
 * resolve it while it is being developed and tested on its own. Third-party peers such as `react` are exempt: they
 * usually resolve transitively through another dependency, and demanding a direct devDependency for each one would
 * report noise rather than a defect.
 */
export function findViolations(manifest) {
  const dependencies = Object.keys(manifest.dependencies ?? {});
  const peerDependencies = manifest.peerDependencies ?? {};
  const devDependencies = manifest.devDependencies ?? {};
  const violations = [];

  for (const dependency of dependencies) {
    if (!isIdentitySensitive(dependency)) continue;
    if (dependency === manifest.name) continue;
    violations.push({
      kind: 'should-be-peer',
      dependency,
      message: `"${dependency}" must be a peerDependency, not a dependency — ${reasonFor(dependency)}`,
    });
  }

  for (const dependency of Object.keys(peerDependencies)) {
    if (!dependency.startsWith('@nocobase/')) continue;
    if (dependency in devDependencies) continue;
    violations.push({
      kind: 'missing-dev',
      dependency,
      message: `"${dependency}" is a peerDependency but has no matching devDependency, so it cannot resolve during local development`,
    });
  }

  return violations;
}

// Only plugins are checked. A plugin is loaded into an application that already provides the runtime, so it must
// never install its own copy.
//
// The other groups are hosts rather than guests. `packages/app` and `packages/libs` compose the runtime — `app-server`
// depending on `@nocobase/db` is what puts the single copy in place for everyone else — and `packages/templates` are
// applications, which is the side that satisfies a peer range. Requiring peers there would leave the ranges with
// nothing to resolve against.
const CHECKED_GROUPS = ['plugins', 'examples'];

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
      const manifestPath = path.join(
        groupDirectory,
        entry.name,
        'package.json',
      );
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      packages.push({ manifest, manifestPath });
    }
  }
  return packages;
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const packages = await collectPackages(repositoryRoot);
  let failed = false;

  for (const { manifest, manifestPath } of packages) {
    const violations = findViolations(manifest);
    if (violations.length === 0) continue;
    failed = true;
    const relativePath = path.relative(repositoryRoot, manifestPath);
    console.error(`\n${relativePath} (${manifest.name})`);
    for (const violation of violations) {
      console.error(`  - ${violation.message}`);
      if (process.env.GITHUB_ACTIONS) {
        console.error(`::error file=${relativePath}::${violation.message}`);
      }
    }
  }

  if (failed) {
    console.error(
      '\nMove each entry to peerDependencies and keep a devDependency on the same package.',
    );
    console.error('See AGENTS.md, "Depending on Identity-Sensitive Packages".');
    process.exit(1);
  }

  console.log(
    `Checked ${packages.length} packages — no peer dependency violations.`,
  );
}

if (process.argv[1] === import.meta.filename) {
  await main();
}
