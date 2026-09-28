// Finds the peer dependencies an installed plugin declares but the application does not satisfy, and decides which of
// them an update within the application's declared ranges can fix.
//
// A package manager installs a plugin whose peer is too old with only a warning (pnpm's `strictPeerDependencies` is
// off by default), and the application fails much later — a Rollup "is not exported by" error in `pnpm build`, or a
// lazily loaded page that never loads. Checking the installed tree right after the upgrade turns that into a failure
// that names its cause.

import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';

import type { PackageManager } from './package-manager.ts';

/** A peer an installed package declares that the version installed beside it does not satisfy. */
export interface UnsatisfiedPeer {
  /** The package declaring the peer, such as a registered plugin. */
  readonly packageName: string;
  readonly packageVersion: string;
  readonly peer: string;
  /** The range the package declares for the peer. */
  readonly range: string;
  /** The version the package resolves, or `null` when the peer is not installed. */
  readonly installed: string | null;
}

/** How the unsatisfied peers split: the packages an update can fix, and the peers it cannot. */
export interface PeerFixPlan {
  /** Peers the application declares with a range that admits the required version. */
  readonly updatable: readonly string[];
  /** Peers an update within the application's declared ranges cannot fix. */
  readonly blocked: readonly UnsatisfiedPeer[];
}

const RANGE_OPTIONS: semver.RangeOptions = { includePrerelease: true };

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;

/**
 * The peers of `packageNames` that the installed tree does not satisfy. Each peer is resolved the way Node resolves it
 * from the package's own directory, so under pnpm it is the copy linked into that package's peer set rather than
 * whatever the application root happens to hold. A package that is not installed is skipped; so is a range that is not
 * semver, such as `workspace:^` in a linked workspace package. An optional peer is only checked when it is installed.
 */
export async function findUnsatisfiedPeers({
  appRoot,
  packageNames,
}: {
  appRoot: string;
  packageNames: readonly string[];
}): Promise<UnsatisfiedPeer[]> {
  const unsatisfied: UnsatisfiedPeer[] = [];
  for (const packageName of packageNames) {
    const packageDirectory = await realpathOrUndefined(
      path.join(appRoot, 'node_modules', packageName),
    );
    if (packageDirectory === undefined) continue;
    const manifest = await readManifest(packageDirectory);
    if (manifest === undefined) continue;

    const peers = stringRecord(manifest.peerDependencies);
    const meta = objectRecord(manifest.peerDependenciesMeta);
    for (const [peer, range] of Object.entries(peers)) {
      if (semver.validRange(range, RANGE_OPTIONS) === null) continue;
      const installed = await resolveInstalledVersion(packageDirectory, peer);
      if (installed === null) {
        if (objectRecord(meta[peer]).optional === true) continue;
      } else if (semver.satisfies(installed, range, RANGE_OPTIONS)) {
        continue;
      }
      unsatisfied.push({
        packageName,
        packageVersion:
          typeof manifest.version === 'string' ? manifest.version : 'unknown',
        peer,
        range,
        installed,
      });
    }
  }
  return unsatisfied;
}

/**
 * Splits unsatisfied peers into those an update can fix and those it cannot. An update can fix a peer the application
 * declares directly, whose declared range admits every range the peer is required at, and that this run has not
 * already updated — a peer still unsatisfied after its own update needs its declared range changed.
 */
export function planPeerFixes({
  applicationPackage,
  unsatisfied,
  alreadyUpdated,
}: {
  applicationPackage: Record<string, unknown>;
  unsatisfied: readonly UnsatisfiedPeer[];
  alreadyUpdated: ReadonlySet<string>;
}): PeerFixPlan {
  const updatable = new Set<string>();
  const blocked: UnsatisfiedPeer[] = [];
  for (const entry of unsatisfied) {
    const declared = declaredRange(applicationPackage, entry.peer);
    const admits =
      declared !== undefined &&
      (semver.validRange(declared.range, RANGE_OPTIONS) === null ||
        semver.intersects(declared.range, entry.range, RANGE_OPTIONS));
    if (admits && !alreadyUpdated.has(entry.peer)) {
      updatable.add(entry.peer);
    } else {
      blocked.push(entry);
    }
  }
  // A peer is only worth updating when no plugin also needs it outside the declared range.
  for (const entry of blocked) updatable.delete(entry.peer);
  return { updatable: [...updatable].sort(), blocked };
}

/**
 * The arguments that update `packageNames` within the application's declared ranges. `yarn up` would otherwise move a
 * package to its latest version and rewrite the range, so under yarn a package is named with its declared range.
 */
export function peerUpdateArgs(
  packageManager: PackageManager,
  applicationPackage: Record<string, unknown>,
  packageNames: readonly string[],
): string[] {
  if (packageManager !== 'yarn') return ['update', ...packageNames];
  return [
    'up',
    ...packageNames.map((packageName) => {
      const declared = declaredRange(applicationPackage, packageName);
      return declared !== undefined &&
        semver.validRange(declared.range, RANGE_OPTIONS) !== null
        ? `${packageName}@${declared.range}`
        : packageName;
    }),
  ];
}

/**
 * The command that fixes one peer: an update when an update can, and otherwise an install at the range every plugin
 * needs, into the section the application already declares it in.
 */
export function peerFixCommand(
  packageManager: PackageManager,
  applicationPackage: Record<string, unknown>,
  peer: string,
  entries: readonly UnsatisfiedPeer[],
  updatable: boolean,
): { command: string; args: string[] } {
  if (updatable) {
    return {
      command: packageManager,
      args: peerUpdateArgs(packageManager, applicationPackage, [peer]),
    };
  }
  const ranges = [...new Set(entries.map((entry) => entry.range))].join(' ');
  const dev =
    declaredRange(applicationPackage, peer)?.field === 'devDependencies';
  return {
    command: packageManager,
    args: [
      packageManager === 'npm' ? 'install' : 'add',
      ...(dev ? ['-D'] : []),
      `${peer}@${ranges}`,
    ],
  };
}

/** One line per unsatisfied peer, for a message people read. */
export function describeUnsatisfiedPeer(entry: UnsatisfiedPeer): string {
  return `${entry.packageName}@${entry.packageVersion} needs ${entry.peer} ${entry.range}, but ${
    entry.installed === null
      ? 'it is not installed'
      : `${entry.installed} is installed`
  }`;
}

function declaredRange(
  applicationPackage: Record<string, unknown>,
  packageName: string,
): { field: (typeof DEPENDENCY_FIELDS)[number]; range: string } | undefined {
  for (const field of DEPENDENCY_FIELDS) {
    const range = stringRecord(applicationPackage[field])[packageName];
    if (range !== undefined) return { field, range };
  }
  return undefined;
}

/** Resolves `peer` from `directory` the way Node does: each ancestor's `node_modules`, nearest first. */
async function resolveInstalledVersion(
  directory: string,
  peer: string,
): Promise<string | null> {
  let current = directory;
  for (;;) {
    if (path.basename(current) !== 'node_modules') {
      const manifest = await readManifest(
        path.join(current, 'node_modules', peer),
      );
      if (manifest !== undefined) {
        return typeof manifest.version === 'string' ? manifest.version : null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function realpathOrUndefined(
  target: string,
): Promise<string | undefined> {
  try {
    return await realpath(target);
  } catch {
    return undefined;
  }
}

async function readManifest(
  directory: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    );
    return objectRecord(parsed);
  } catch {
    return undefined;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectRecord(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
