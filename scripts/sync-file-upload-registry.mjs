import { cp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(
  root,
  'packages/app-template-default/registry/nocobase-file-upload',
);
const target = path.join(root, 'packages/hub/registry/nocobase-file-upload');
const check = process.argv.includes('--check');

if (check) {
  const differences = await compareDirectories(source, target);
  if (differences.length > 0) {
    console.error(
      `Hub file-upload Registry is out of sync:\n${differences.join('\n')}`,
    );
    process.exitCode = 1;
  }
} else {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

async function compareDirectories(left, right, relative = '') {
  const [leftEntries, rightEntries] = await Promise.all([
    readEntries(left),
    readEntries(right),
  ]);
  const names = new Set([...leftEntries.keys(), ...rightEntries.keys()]);
  const differences = [];
  for (const name of [...names].sort()) {
    const leftEntry = leftEntries.get(name);
    const rightEntry = rightEntries.get(name);
    const item = path.join(relative, name);
    if (
      !leftEntry ||
      !rightEntry ||
      leftEntry.isDirectory() !== rightEntry.isDirectory()
    ) {
      differences.push(item);
      continue;
    }
    if (leftEntry.isDirectory()) {
      differences.push(
        ...(await compareDirectories(
          path.join(left, name),
          path.join(right, name),
          item,
        )),
      );
      continue;
    }
    const [leftContent, rightContent] = await Promise.all([
      readFile(path.join(left, name)),
      readFile(path.join(right, name)),
    ]);
    if (!leftContent.equals(rightContent)) {
      differences.push(item);
    }
  }
  return differences;
}

async function readEntries(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return new Map(entries.map((entry) => [entry.name, entry]));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
}
