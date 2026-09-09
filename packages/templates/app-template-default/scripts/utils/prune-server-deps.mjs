// Removes from the installed `dist/node_modules` everything the server never loads.
//
// The install that precedes this resolves `dependencies` transitively, which is a package-level answer to a
// file-level question: a package is either wholly installed or wholly absent. Most of what that installs is never
// required. `lucide-react` is read for its `package.json` by a telemetry probe and contributes 31 MB of React
// components to a tree with no browser in it; 296 packages are in the deployment for their manifest alone.
//
// So this traces the real import graph from the server entry points and deletes the files outside it. Nothing is
// downloaded and no manifest is rewritten — `dist/package.json` still describes what the application depends on,
// and re-running the install restores the full tree.
//
// What a trace cannot see is configured rather than guessed. A package loaded by a name assembled at runtime
// appears in no import statement and is indistinguishable from an unused one, so `nocobase.serverDeps.keep` names
// those explicitly. Native modules are kept whole: a `.node` binary is loaded through a filesystem search rather
// than a resolvable specifier, and the cost of pruning one wrongly is a loader error on the deployed server that
// names nothing actionable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCANNED_DIRECTORIES,
  directorySize,
  findNativeModules,
  formatMegabytes,
  installedPackages,
  isKept,
  readJson,
  readServerDepsConfig,
  traceServer,
} from './server-deps.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const distDir = path.join(rootDir, 'dist');
const nodeModulesDir = path.join(distDir, 'node_modules');

const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(nodeModulesDir)) {
  console.error('Missing dist/node_modules. Run pnpm build first.');
  process.exit(1);
}

const appManifest = readJson(path.join(rootDir, 'package.json'));
const { keep, keepFromArgv } = readServerDepsConfig(
  appManifest,
  process.argv.slice(2),
);

const before = directorySize(nodeModulesDir);
const { entryPoints, files, warnings } = await traceServer(distDir);

if (entryPoints.length === 0) {
  console.error('No server entry points found in dist/. Run pnpm build first.');
  process.exit(1);
}

// Paths are relative to dist/ and use forward slashes, matching what the trace returns.
const reachable = new Set(files);

// Native modules stay whole. Their binary is located at runtime by searching the filesystem rather than by
// resolving a specifier, so the trace sees the wrapper but not necessarily every file the search consults.
const nativePackages = new Set(
  findNativeModules(nodeModulesDir).map((native) => native.manifest.name),
);

// Indexed by name so a kept package's own dependencies can be followed. A package kept because nothing imports
// it by a literal name is reached the same way at runtime — through its own `require` calls — so keeping only the
// package itself leaves it unable to load. `pino-pretty` fails on `Cannot find module 'pump'` exactly this way.
const directoryByName = new Map();
for (const packageDir of installedPackages(nodeModulesDir)) {
  try {
    directoryByName.set(
      readJson(path.join(packageDir, 'package.json')).name,
      packageDir,
    );
  } catch {
    continue;
  }
}

const keptWholesale = new Set();
const keepWithDependencies = (name, seen = new Set()) => {
  if (seen.has(name)) return;
  seen.add(name);
  const packageDir = directoryByName.get(name);
  if (!packageDir) return;
  keptWholesale.add(packageDir);

  let manifest;
  try {
    manifest = readJson(path.join(packageDir, 'package.json'));
  } catch {
    return;
  }
  // `optionalDependencies` are followed too: one that is installed is one the runtime may load, and an absent one
  // simply resolves to nothing here.
  for (const dependency of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]) {
    keepWithDependencies(dependency, seen);
  }
};

for (const name of directoryByName.keys()) {
  if (nativePackages.has(name) || isKept(name, keep))
    keepWithDependencies(name);
}

const isInsideScannedDirectory = (absolutePath) => {
  const relative = path.relative(nodeModulesDir, absolutePath).split(path.sep);
  return relative.some((segment) => SCANNED_DIRECTORIES.has(segment));
};

const isInsideKeptPackage = (absolutePath) => {
  for (const packageDir of keptWholesale) {
    if (
      absolutePath === packageDir ||
      absolutePath.startsWith(`${packageDir}${path.sep}`)
    ) {
      return true;
    }
  }
  return false;
};

let removedFiles = 0;

/**
 * Deletes unreachable files, then the directories left empty.
 *
 * Returns whether the directory still holds anything, so an empty tree is removed in the same pass rather than
 * needing a second walk to find directories that only contained pruned files.
 */
function prune(directory) {
  let kept = false;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return true;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (
        isInsideKeptPackage(absolutePath) ||
        isInsideScannedDirectory(absolutePath)
      ) {
        kept = true;
        continue;
      }
      if (prune(absolutePath)) kept = true;
      else if (!dryRun)
        fs.rmSync(absolutePath, { recursive: true, force: true });
      continue;
    }

    const relativePath = path
      .relative(distDir, absolutePath)
      .split(path.sep)
      .join('/');

    if (
      reachable.has(relativePath) ||
      isInsideKeptPackage(absolutePath) ||
      isInsideScannedDirectory(absolutePath)
    ) {
      kept = true;
      continue;
    }

    // A symlink into a pruned target would dangle; both are removed together.
    removedFiles += 1;
    if (!dryRun) fs.rmSync(absolutePath, { force: true });
  }

  return kept;
}

prune(nodeModulesDir);

console.log(
  dryRun
    ? `Would remove ${removedFiles} file(s) from dist/node_modules (${formatMegabytes(before)} installed).`
    : (() => {
        const after = directorySize(nodeModulesDir);
        return `Pruned dist/node_modules: ${formatMegabytes(before)} -> ${formatMegabytes(after)} (removed ${removedFiles} files, saved ${formatMegabytes(before - after)}).`;
      })(),
);
console.log(
  `Kept whole: ${keptWholesale.size} package(s) — ${nativePackages.size} native, ${keep.length} named by keep rules (with their dependencies).`,
);
if (keepFromArgv.length > 0) {
  console.log(
    `${keepFromArgv.join(', ')} kept via --keep. Add to nocobase.serverDeps.keep in package.json to make it stick.`,
  );
}

if (warnings.size > 0) {
  console.log(
    `\n${warnings.size} specifier(s) could not be resolved by the trace. Run pnpm server:deps:inspect to review\nthem; anything loaded by a name computed at runtime belongs in nocobase.serverDeps.keep.`,
  );
}
