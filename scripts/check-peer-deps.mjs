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

// Packages whose runtime identity must be unique in a process.
//
// This list records decisions already made; it is not the rule and it is expected to be incomplete. A package belongs
// here when it exports something that only works while one copy of the module exists: a value used as a key by
// identity (a ServiceToken in the container's Map), a React context, a module-level singleton, or a registration into
// a process-wide registry. Classes with private members also carry declaration identity when their instances cross
// package boundaries. Public type contracts must not resolve those classes through independent package versions.
//
// The reason is recorded per package because it is what lets someone apply the rule to a package not listed here. A
// bare list gets copied without being understood. See AGENTS.md, "Depending on Identity-Sensitive Packages".
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
  [
    '@nocobase/app-client',
    'exports React contexts plus identity-keyed API and realtime client tokens',
  ],
  ['@nocobase/app-portal-sdk', 'exports the nocobaseClient module singleton'],
  ['@nocobase/i18n', 'exports React contexts for the i18n runtime'],
  [
    '@nocobase/queue',
    'registers job classes into the global Locator of @boringnode/queue',
  ],
  [
    '@nocobase/caching',
    'owns the shared cache driver registry and Caching class',
  ],
  [
    '@nocobase/ai-employee',
    'exports fileStorageFactoryToken for application extensions',
  ],
  [
    '@nocobase/authorization',
    'shares Authorization instances and AuthorizationDeniedError identity',
  ],
  [
    '@nocobase/repository-input',
    'uses a module-local Symbol on filter nodes shared with the database',
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
 * An identity-sensitive package is a peer, never a dependency; the application owns its compatible shared provider.
 *
 * A matching devDependency used to be required alongside each workspace peer, on the grounds that the peer range is
 * wide enough for development to drift off this repository's copy. It does not: pnpm resolves a `workspace:^` peer to
 * the package in this repository, the same as `workspace:*` would, and a plugin with the devDependency removed still
 * links, typechecks, builds, and tests against it. The rule asked for a second declaration that changed nothing, so
 * every peer — workspace or third-party — is now declared once.
 */
export function findViolations(manifest) {
  const dependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
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

  return violations;
}

// Libraries and runtimes also consume host-owned objects. Only application templates provide the shared runtime;
// their production dependencies are checked separately because deployment disables automatic peer installation.
const CHECKED_GROUPS = ['plugins', 'examples', 'libs', 'app', 'tools'];

const CLIENT_ONLY_PACKAGES = new Set([
  '@nocobase/app-client',
  '@nocobase/app-portal-sdk',
]);

export function findApplicationViolations(manifest, packages) {
  const violations = [];
  const visited = new Set();
  const provided = new Set(Object.keys(manifest.dependencies ?? {}));
  const pending = [...provided];
  while (pending.length > 0) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const dependency = packages.get(name);
    if (!dependency) continue;
    pending.push(...Object.keys(dependency.dependencies ?? {}));
    for (const peer of Object.keys(dependency.peerDependencies ?? {})) {
      if (!isIdentitySensitive(peer) || CLIENT_ONLY_PACKAGES.has(peer))
        continue;
      if (dependency.peerDependenciesMeta?.[peer]?.optional) continue;
      if (!provided.has(peer)) {
        violations.push({
          kind: 'missing-runtime-peer',
          dependency: peer,
          message: `"${peer}" is required by ${name} and must be in the application's dependencies; production installs do not auto-install peers`,
        });
      }
      pending.push(peer);
    }
  }
  return violations;
}

export async function collectPackages(repositoryRoot, groups = CHECKED_GROUPS) {
  const packages = [];
  for (const group of groups) {
    const groupDirectory = path.join(repositoryRoot, 'packages', group);
    let entries;
    try {
      entries = await readdir(groupDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
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
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
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
  const applications = await collectPackages(repositoryRoot, ['templates']);
  const byName = new Map(
    packages.map(({ manifest }) => [manifest.name, manifest]),
  );
  let failed = false;

  for (const { manifest, manifestPath } of [...packages, ...applications]) {
    const violations = applications.some((app) => app.manifest === manifest)
      ? findApplicationViolations(manifest, byName)
      : findViolations(manifest);
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
      '\nConsumers must use peerDependencies; applications must provide their runtime peers in dependencies.',
    );
    console.error('See AGENTS.md, "Depending on Identity-Sensitive Packages".');
    process.exit(1);
  }

  console.log(
    `Checked ${packages.length} packages and ${applications.length} applications — no peer dependency violations.`,
  );
}

if (process.argv[1] === import.meta.filename) {
  await main();
}
