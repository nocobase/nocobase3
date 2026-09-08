// Reports what a deployable `dist/` actually needs: which files the server reaches, which packages are installed
// whole to satisfy a single import, and what each native module requires in order to run somewhere other than
// this machine.
//
// Read-only. It builds nothing and downloads nothing. `pnpm server:deps:prune` performs what this describes, and
// both read the same analysis from `server-deps.mjs`, so this is a preview of that step rather than a second
// opinion about it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FRAMEWORK_KEEP,
  SCANNED_DIRECTORIES,
  directorySize,
  findNativeModules,
  formatMegabytes,
  installedPackages,
  isKept,
  owningPackage,
  platformPackageOwners,
  readJson,
  readServerDepsConfig,
  sizeOf,
  traceServer,
} from './server-deps.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const nodeModulesDir = path.join(distDir, 'node_modules');

if (!fs.existsSync(distDir)) {
  console.error('Missing dist/. Run pnpm build first.');
  process.exit(1);
}

const appManifest = readJson(path.join(rootDir, 'package.json'));
const serverDeps = readServerDepsConfig(appManifest, process.argv.slice(2));

const {
  entryPoints,
  files: tracedFiles,
  warnings,
} = await traceServer(distDir);

let tracedBytes = 0;
const filesByPackage = new Map();
for (const file of tracedFiles) {
  tracedBytes += sizeOf(path.join(distDir, file));
  const owner = owningPackage(file);
  if (owner) filesByPackage.set(owner, (filesByPackage.get(owner) ?? 0) + 1);
}

const installedBytes = directorySize(nodeModulesDir);

console.log('# Server deployment inspection\n');
console.log(`Entry points traced: ${entryPoints.length}`);
console.log(`Files reachable:     ${tracedFiles.length}`);
console.log(`Installed now:       ${formatMegabytes(installedBytes)}`);
console.log(`Reachable:           ${formatMegabytes(tracedBytes)}`);
if (installedBytes > 0) {
  const saved = installedBytes - tracedBytes;
  console.log(
    `Prunable:            ${formatMegabytes(saved)} (${((saved / installedBytes) * 100).toFixed(0)}%)`,
  );
}

// A package reached for its manifest alone is what a package-level dependency walk cannot express: the whole
// package is installed to satisfy something that read one file.
const manifestOnly = [];
for (const [name, count] of filesByPackage) {
  if (count !== 1) continue;
  const only = tracedFiles.find((file) => owningPackage(file) === name);
  if (only?.endsWith('/package.json')) {
    manifestOnly.push([name, directorySize(path.join(nodeModulesDir, name))]);
  }
}

if (manifestOnly.length > 0) {
  manifestOnly.sort((left, right) => right[1] - left[1]);
  const total = manifestOnly.reduce((sum, [, bytes]) => sum + bytes, 0);
  console.log(
    `\n## Reached for their manifest alone (${manifestOnly.length} packages, ${formatMegabytes(total)} installed)\n`,
  );
  console.log(
    'Only package.json is read. The rest of each package never loads.\n',
  );
  for (const [name, bytes] of manifestOnly.slice(0, 10)) {
    console.log(`  ${formatMegabytes(bytes).padStart(9)}  ${name}`);
  }
  if (manifestOnly.length > 10) {
    console.log(`  ${' '.repeat(9)}  … and ${manifestOnly.length - 10} more`);
  }
}

const owners = platformPackageOwners(nodeModulesDir);
const natives = findNativeModules(nodeModulesDir);

console.log(`\n## Native modules (${natives.length} found)\n`);
if (natives.length === 0) {
  console.log(
    'None. This build is pure JavaScript and runs anywhere Node does.',
  );
} else {
  console.log(
    'Detected by manifest signal, not by name, so a native dependency added later is classified too.\n',
  );
  for (const native of natives) {
    const bytes = native.binaries.reduce((sum, file) => sum + sizeOf(file), 0);
    console.log(`${native.manifest.name}  (${formatMegabytes(bytes)})`);
    console.log(`  mechanism: ${native.kind}`);
    switch (native.kind) {
      case 'platform-package': {
        const owner = owners.get(native.manifest.name);
        console.log(
          `  builds for: ${(native.os ?? []).join(',')}-${(native.cpu ?? []).join(',')}`,
        );
        console.log(
          owner
            ? `  to retarget: install the matching member of ${owner}'s optionalDependencies`
            : '  to retarget: install the sibling package for the target platform',
        );
        break;
      }
      case 'fetched-at-install':
        console.log(`  install script: ${native.installScript}`);
        console.log(
          '  to retarget: re-fetch with explicit --platform/--arch/--libc/--target',
        );
        break;
      case 'bundled-multi-platform':
        console.log(
          `  ships ${native.binaries.length} binaries; the target needs one and the rest are removable`,
        );
        break;
      default:
        console.log(
          '  one bundled binary, no install script — verify by hand that it matches the target',
        );
    }
  }
  console.log(
    '\nNative packages are never pruned: their binary is located by a filesystem search rather than a\nresolvable specifier, and removing one wrongly fails on the deployed server with a loader error.',
  );
}

console.log('\n## Keep rules\n');
console.log(
  'Packages kept regardless of the trace, because nothing imports them by a literal name. Each is kept with its\nown dependencies, since a package the trace cannot see reaches its dependencies the same way at runtime.\n',
);

const installedNames = [...installedPackages(nodeModulesDir)].map(
  (dir) => readJson(path.join(dir, 'package.json')).name,
);

const describeKeep = (entry) => {
  const matches = installedNames.filter((name) => isKept(name, [entry]));
  const unreachable = matches.filter((name) => !filesByPackage.has(name));
  return matches.length === 0
    ? `  ${entry}  — matches nothing installed; stale entry?`
    : `  ${entry}  — ${matches.length} installed, ${unreachable.length} unreachable and kept by this rule`;
};

console.log(
  'Built in (the framework resolves these by name; no configuration needed):',
);
for (const entry of FRAMEWORK_KEEP) console.log(describeKeep(entry));
console.log(
  `\nDirectories kept for every package, being read by scanning rather than importing: ${[...SCANNED_DIRECTORIES].join(', ')}.`,
);

console.log('\nFrom nocobase.serverDeps.keep in package.json:');
if (serverDeps.keepFromManifest.length === 0) {
  console.log(
    '  (none) — add a package here when the server cannot find it at runtime.',
  );
} else {
  for (const entry of serverDeps.keepFromManifest)
    console.log(describeKeep(entry));
}

if (serverDeps.keepFromArgv.length > 0) {
  console.log('\nFrom --keep (this run only, not persisted):');
  for (const entry of serverDeps.keepFromArgv) console.log(describeKeep(entry));
}

console.log(`\n## Unresolved specifiers (${warnings.size})\n`);
if (warnings.size === 0) {
  console.log('None.');
} else {
  console.log(
    'Each is a specifier the trace could not resolve. An optional peer that is genuinely absent is expected;\nanything loaded by a name computed at runtime is not, and belongs in nocobase.serverDeps.keep.\n',
  );
  const seen = new Set();
  for (const warning of warnings) {
    const line = String(warning.message ?? warning).split('\n')[0];
    if (seen.has(line)) continue;
    seen.add(line);
    console.log(`  ${line}`);
  }
}
