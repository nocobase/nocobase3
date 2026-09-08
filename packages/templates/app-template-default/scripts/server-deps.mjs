// Shared analysis behind `inspect-server-deps.mjs` and `prune-server-deps.mjs`.
//
// The two scripts answer the same question — what does the deployed server actually need — and must answer it
// identically, or the report stops describing what the build does. Keeping the trace, the configuration, and the
// native-module classification here is what makes an inspection a preview of the prune rather than a second
// opinion about it.
import fs from 'node:fs';
import path from 'node:path';

/**
 * The entry points a deployment runs.
 *
 * `standalone` and `embedded` are the two ways the server starts. The migrate and seed scripts are separate
 * processes a deployment also executes, and they reach code the server entries do not, so a trace that omitted
 * them would prune migrations out of the deployment.
 */
export const ENTRY_POINTS = [
  'server/standalone.js',
  'server/embedded.js',
  'scripts/migrate.js',
  'scripts/seed.js',
];

/**
 * Packages the framework loads by a name it holds itself, rather than by an import.
 *
 * These are not the application's choice and it has no reason to know about them, so they are kept by default
 * instead of being listed in every generated application's `package.json` — a default that each application has
 * to rediscover by crashing is not a default. `app-server` names both pino transports in a `target:` string, so
 * no import mentions them and a trace cannot see either; without this the server dies during startup with
 * `unable to determine transport target for "pino-pretty"`.
 *
 * An application adds its own runtime-resolved packages through `nocobase.serverDeps.keep`. This list is for
 * what the framework guarantees, and grows when the framework starts resolving another package by name.
 */
export const FRAMEWORK_KEEP = ['pino-pretty', 'pino-roll'];

/**
 * Directories published to be read by scanning rather than by importing.
 *
 * A migration is discovered by listing a directory and reading whatever is in it, so no import statement names a
 * migration file and a trace sees none of them. Pruning them leaves a deployment that starts and then fails on
 * the first query against a table its migration would have created. Locales fall back to their keys the same way.
 *
 * Kept for every package, because a plugin ships its own `dist/database` and the application cannot enumerate
 * which of its plugins have migrations.
 */
export const SCANNED_DIRECTORIES = new Set([
  'database',
  'migrations',
  'seeds',
  'locales',
]);

/** Install scripts that mean the package compiles or downloads a binary at install time. */
const NATIVE_INSTALL_SIGNAL =
  /prebuild-install|node-gyp|node-pre-gyp|prebuildify|cmake-js/;

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export const sizeOf = (file) => {
  try {
    return fs.lstatSync(file).size;
  } catch {
    return 0;
  }
};

export const formatMegabytes = (bytes) =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const directorySize = (directory) => {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(entryPath) : sizeOf(entryPath);
  }
  return total;
};

/** The installed package a path inside `dist` belongs to, or `undefined` for application code. */
export const owningPackage = (file) =>
  file.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?:\/|$)/u)?.[1];

/**
 * Every installed package directory, including scoped ones.
 *
 * An explicit walk rather than a glob because a scope directory holds packages one level deeper, and treating
 * `@scope` itself as a package would read a `package.json` that does not exist.
 */
export function* installedPackages(nodeModulesDir) {
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@')) {
      yield* installedPackages(entryPath);
      continue;
    }
    if (fs.existsSync(path.join(entryPath, 'package.json'))) yield entryPath;
  }
}

/**
 * The application's `nocobase.serverDeps` configuration.
 *
 * Detection is generic, but two decisions cannot be derived from the tree and have to be written down:
 *
 * - `keep` lists packages a file trace cannot see. A package loaded by a name computed at runtime — a driver
 *   chosen by a connection setting, a plugin resolved from a database value — appears in no import statement, so
 *   the trace correctly reports it unreachable and pruning it would break the deployment at first use. An entry
 *   ending in `*` matches by prefix.
 * `--keep <names>` adds to the configured list for one run, comma-separated, so a package can be identified
 * before it is written down. The manifest is the durable answer: an entry only on a command line is missing from
 * the next build, and from everyone else's.
 */
export function readServerDepsConfig(manifest, argv = []) {
  const configured = manifest.nocobase?.serverDeps ?? {};
  const fromManifest = configured.keep ?? [];

  const fromArgv = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const inline = argument.startsWith('--keep=')
      ? argument.slice('--keep='.length)
      : argument === '--keep'
        ? argv[index + 1]
        : undefined;
    if (inline) fromArgv.push(...inline.split(',').map((name) => name.trim()));
  }

  return {
    keep: [
      ...new Set([
        ...FRAMEWORK_KEEP,
        ...fromManifest,
        ...fromArgv.filter(Boolean),
      ]),
    ],
    keepFromManifest: fromManifest,
    keepFromArgv: fromArgv.filter(Boolean),
  };
}

/** Whether a package name is covered by a `keep` entry, supporting a trailing `*` as a prefix match. */
export function isKept(packageName, keep) {
  return keep.some((entry) =>
    entry.endsWith('*')
      ? packageName.startsWith(entry.slice(0, -1))
      : packageName === entry,
  );
}

export function findBinaries(directory, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) findBinaries(entryPath, found);
    else if (entry.name.endsWith('.node')) found.push(entryPath);
  }
  return found;
}

/**
 * How a package obtains its `.node` binary, or `undefined` when it has none.
 *
 * Classified by manifest signal rather than by package name, so a native dependency an application adds later is
 * handled without anyone extending a list here. A hard-coded set of names would silently mis-handle whatever an
 * application adds next, which is the failure this is meant to prevent.
 *
 * - `platform-package` — the manifest declares `cpu`/`os`, so the package *is* one platform's binary and another
 *   target means a different package. Its parent lists the whole set in `optionalDependencies`.
 * - `fetched-at-install` — the install script runs a native build helper, so the binary was obtained for whichever
 *   platform ran the install.
 * - `bundled-multi-platform` — binaries for several platforms ship inside the package, so the target's is already
 *   present and the rest are dead weight.
 * - `bundled-single-platform` — one binary, no install script, no platform metadata. Nothing can be inferred, so
 *   it is reported for a human to judge.
 */
export function classifyNative(packageDir) {
  const manifest = readJson(path.join(packageDir, 'package.json'));
  const binaries = findBinaries(packageDir);
  const installScript =
    manifest.scripts?.install ?? manifest.scripts?.postinstall ?? '';

  if (manifest.cpu || manifest.os) {
    return {
      kind: 'platform-package',
      manifest,
      binaries,
      cpu: manifest.cpu,
      os: manifest.os,
    };
  }
  if (NATIVE_INSTALL_SIGNAL.test(installScript)) {
    return { kind: 'fetched-at-install', manifest, binaries, installScript };
  }
  if (binaries.length === 0) return undefined;
  return {
    kind:
      binaries.length > 1
        ? 'bundled-multi-platform'
        : 'bundled-single-platform',
    manifest,
    binaries,
  };
}

/** Packages declaring a set of platform-specific builds, mapped to the parent that lists the set. */
export function platformPackageOwners(nodeModulesDir) {
  const owners = new Map();
  for (const packageDir of installedPackages(nodeModulesDir)) {
    let manifest;
    try {
      manifest = readJson(path.join(packageDir, 'package.json'));
    } catch {
      continue;
    }
    const optional = Object.keys(manifest.optionalDependencies ?? {});
    if (optional.length < 2) continue;
    for (const name of optional) owners.set(name, manifest.name);
  }
  return owners;
}

/** Native modules present in a built tree. */
export function findNativeModules(nodeModulesDir) {
  const natives = [];
  for (const packageDir of installedPackages(nodeModulesDir)) {
    let classified;
    try {
      classified = classifyNative(packageDir);
    } catch {
      continue;
    }
    if (classified) natives.push({ packageDir, ...classified });
  }
  return natives;
}

/** Traces the server entry points and returns the reachable files plus unresolved specifiers. */
export async function traceServer(distDir) {
  const { nodeFileTrace } = await import('@vercel/nft');
  const entryPoints = ENTRY_POINTS.map((entry) =>
    path.join(distDir, entry),
  ).filter((entry) => fs.existsSync(entry));
  const { fileList, warnings } = await nodeFileTrace(entryPoints, {
    base: distDir,
  });
  return { entryPoints, files: [...fileList], warnings };
}

/**
 * Node major version to ABI. `node-abi` would answer this, but it is a dependency for a table that changes once a
 * year and, given a bare major, silently returns the major itself rather than the ABI — `getAbi('24')` is 24, not
 * 137, because it reads the argument as a complete 0.x-era version. A wrong ABI downloads a binary that does not
 * load, so the mapping is explicit.
 */
const NODE_ABI = { 20: 115, 22: 127, 24: 137, 26: 147 };

/**
 * Default target when none is given: this machine.
 *
 * A build is run far more often to look at the result than to ship it, and `pnpm build && pnpm start` has to
 * work. Defaulting to a deployment platform would make the common case produce binaries the developer cannot
 * run, to spare the rarer case an explicit flag.
 *
 * The trade is that a deployment build needs `--target`, and forgetting it yields binaries that fail on the
 * server. `dist/package.json` records what was targeted so that failure is diagnosable rather than mysterious,
 * and the build says which platform it produced on every run.
 */
const DEFAULT_NODE_MAJOR = 24;

const readFlag = (argv, name) => {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    if (argument === name) return argv[index + 1];
  }
  return undefined;
};

/**
 * The deployment target a build is producing binaries for.
 *
 * `--target` covers platform, architecture, and C library together, because they are chosen together and a
 * partial answer is not useful: `linux-x64` and `linux-x64-musl` are different binaries, and using one where the
 * other belongs fails at load with an error naming a shared library rather than a cause.
 *
 * `--node-version` takes a major (`24`), which is what a person knows about their server. It is separate from
 * `--target` because it varies independently — the same Linux host may run any of several Node versions.
 *
 * `--target current` opts out, producing binaries for the building machine. That is right for local work and
 * wrong for a deployment, which is why it is not the default: a build that silently targets the developer's
 * laptop fails only once it reaches a server.
 */
export function parseTarget(argv = []) {
  const requested = readFlag(argv, '--target') ?? 'current';
  const nodeMajorRaw =
    readFlag(argv, '--node-version') ?? String(DEFAULT_NODE_MAJOR);
  const nodeMajor = Number.parseInt(String(nodeMajorRaw).split('.')[0], 10);

  const abi = NODE_ABI[nodeMajor];
  if (!abi) {
    throw new Error(
      `Unsupported --node-version ${nodeMajorRaw}. Known: ${Object.keys(NODE_ABI).join(', ')}.`,
    );
  }

  if (requested === 'current') {
    return {
      isCurrentMachine: true,
      platform: process.platform,
      arch: process.arch,
      libc: 'glibc',
      abi: Number(process.versions.modules),
      nodeMajor: Number(process.versions.node.split('.')[0]),
      nodeVersion: process.versions.node,
      label: `${process.platform}-${process.arch}`,
      napiSuffix: `${process.platform}-${process.arch}`,
    };
  }

  const match = /^(darwin|linux|win32)-(x64|arm64|arm)(?:-(musl|gnu))?$/u.exec(
    requested,
  );
  if (!match) {
    throw new Error(
      `Unrecognized --target "${requested}". Use linux-x64, linux-arm64, linux-x64-musl, darwin-arm64, win32-x64, or current.`,
    );
  }

  const [, platform, arch, libcSuffix] = match;
  const libc = libcSuffix === 'musl' ? 'musl' : 'glibc';

  // The suffix a platform-specific npm package is published under. Linux distinguishes its C library, Windows
  // names its toolchain, and macOS needs neither.
  const napiSuffix =
    platform === 'linux'
      ? `linux-${arch}-${libc === 'musl' ? 'musl' : 'gnu'}`
      : platform === 'win32'
        ? `win32-${arch}-msvc`
        : `darwin-${arch}`;

  return {
    isCurrentMachine: false,
    platform,
    arch,
    libc,
    abi,
    nodeMajor,
    nodeVersion: `${nodeMajor}.0.0`,
    label:
      libcSuffix === 'musl'
        ? `${platform}-${arch}-musl`
        : `${platform}-${arch}`,
    napiSuffix,
  };
}
