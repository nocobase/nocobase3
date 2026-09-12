// Builds `dist` without ever leaving it missing.
//
// Every other package's `eslint.config.js`, and several of their Vitest and Vite configurations, import this package
// from `dist`. The repository scripts that lint, format, or test build this package first, and pnpm runs the packages
// in parallel, so a build that deleted `dist` before invoking `tsc` opened a window in which a sibling package
// resolving `@nocobase/dev-config/eslint` failed with ERR_MODULE_NOT_FOUND. The failure landed on whichever package
// happened to start during that window, which made it read as a problem with that package rather than with this one.
//
// Compiling into a temporary directory and swapping it in afterwards keeps the previous output readable for the whole
// build and replaces it in one step. The swap is not atomic — the old directory is removed before the new one takes
// its place — but the gap is a rename rather than a TypeScript compilation, which is the difference between
// microseconds and seconds.
import { spawnSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';

const packageRoot: string = path.resolve(import.meta.dirname, '..');
const distDirectory: string = path.join(packageRoot, 'dist');
const stagingDirectory: string = path.join(packageRoot, 'dist.build');

await rm(stagingDirectory, { force: true, recursive: true });

const result = spawnSync(
  'pnpm',
  ['exec', 'tsc', '-p', 'tsconfig.build.json', '--outDir', stagingDirectory],
  { cwd: packageRoot, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  await rm(stagingDirectory, { force: true, recursive: true });
  process.exit(result.status ?? 1);
}

await rm(distDirectory, { force: true, recursive: true });
await rename(stagingDirectory, distDirectory);
