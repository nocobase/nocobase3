import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.resolve(process.argv[2] ?? path.join(rootDir, 'dist'));
const realDistDir = fs.realpathSync(distDir);

const assertInsideDist = (targetPath, linkPath) => {
  const relative = path.relative(realDistDir, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to materialize symlink outside dist: ${linkPath} -> ${targetPath}`,
    );
  }
};

const validate = (directory) => {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name === '.bin') continue;
    if (entry.isSymbolicLink()) {
      const targetPath = path.resolve(directory, fs.readlinkSync(entryPath));
      assertInsideDist(fs.realpathSync(targetPath), entryPath);
      continue;
    }
    if (entry.isDirectory()) validate(entryPath);
  }
};

const materialize = (directory) => {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name === '.bin') {
      fs.rmSync(entryPath, { recursive: true, force: true });
      continue;
    }
    if (entry.isSymbolicLink()) {
      const targetPath = fs.realpathSync(
        path.resolve(directory, fs.readlinkSync(entryPath)),
      );
      fs.rmSync(entryPath, { recursive: true, force: true });
      fs.cpSync(targetPath, entryPath, { recursive: true, dereference: true });
      continue;
    }
    if (entry.isDirectory()) materialize(entryPath);
  }
};

validate(distDir);
materialize(distDir);
