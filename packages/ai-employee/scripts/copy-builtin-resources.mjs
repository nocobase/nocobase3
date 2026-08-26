import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceDir = path.join(packageDir, 'src', 'builtin');
const targetDir = path.join(packageDir, 'dist', 'builtin');

function copyStaticResources(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyStaticResources(sourcePath, targetPath);
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.ts.map')) continue;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

if (!fs.existsSync(sourceDir)) process.exit(0);
fs.mkdirSync(targetDir, { recursive: true });
copyStaticResources(sourceDir, targetDir);
