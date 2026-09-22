import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
for (const config of ['tsconfig.json', 'tsconfig.scripts.json']) {
  const result = spawnSync('pnpm', ['exec', 'tsc', '-p', config], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function copy(directory, target) {
  mkdirSync(target, { recursive: true });
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const from = path.join(directory, item.name);
    const to = path.join(target, item.name);
    if (item.isDirectory()) copy(from, to);
    else if (item.name.endsWith('.mjs') || item.name.endsWith('.mts'))
      cpSync(from, to);
  }
}
copy(path.join(root, 'src'), path.join(root, 'dist'));
