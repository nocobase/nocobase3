import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(import.meta.dirname, '..');

rmSync(path.join(packageRoot, 'dist'), { force: true, recursive: true });

// `tsconfig.json` compiles the TypeScript; `tsconfig.scripts.json` only emits declarations for the `.mjs` scripts
// under `src/tools/scripts`, which are shipped as they are.
for (const config of ['tsconfig.json', 'tsconfig.scripts.json']) {
  const compile = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '-p', config],
    { cwd: packageRoot, stdio: 'inherit' },
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);
}

function copyScripts(directory, target) {
  mkdirSync(target, { recursive: true });
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const from = path.join(directory, item.name);
    const to = path.join(target, item.name);
    if (item.isDirectory()) copyScripts(from, to);
    else if (item.name.endsWith('.mjs') || item.name.endsWith('.mts'))
      cpSync(from, to);
  }
}
copyScripts(path.join(packageRoot, 'src'), path.join(packageRoot, 'dist'));
