import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  await checkRegistryImports();
  await checkStandaloneAppClient();
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

async function checkRegistryImports() {
  const config = JSON.parse(
    await readFile(
      path.join(root, 'packages/app-template-default/registry.config.json'),
      'utf8',
    ),
  );
  const item = config.items.find(
    (candidate) => candidate.name === 'file-upload',
  );
  if (!item) {
    throw new Error('The file-upload Registry item is missing.');
  }
  const declared = new Set(
    (item.dependencies ?? []).map((dependency) => dependencyName(dependency)),
  );
  const imports = await readExternalImports(source, item.source.include);
  const undeclared = [...imports].filter(
    (dependency) => dependency !== 'react' && !declared.has(dependency),
  );
  if (undeclared.length > 0) {
    throw new Error(
      `file-upload Registry imports undeclared dependencies: ${undeclared.join(', ')}`,
    );
  }
}

async function checkStandaloneAppClient() {
  const directory = await mkdtemp(path.join(tmpdir(), 'nocobase-file-upload-'));
  try {
    await Promise.all([
      cp(
        path.join(source, 'app-client.ts'),
        path.join(directory, 'app-client.ts'),
      ),
      writeFile(
        path.join(directory, 'package.json'),
        '{"name":"file-upload-registry-check","private":true,"type":"module"}\n',
      ),
    ]);
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', './app-client.ts'],
      { cwd: directory, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(
        `file-upload Registry app client is not standalone:\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readExternalImports(directory, include) {
  const files = (await walkFiles(directory)).filter((file) =>
    isIncluded(file, include),
  );
  const dependencies = new Set();
  const pattern = /(?:from\s+|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g;
  for (const file of files.filter((candidate) =>
    /\.[cm]?[jt]sx?$/.test(candidate),
  )) {
    const content = await readFile(path.join(directory, file), 'utf8');
    for (const match of content.matchAll(pattern)) {
      const specifier = match[2];
      if (
        !specifier ||
        specifier.startsWith('.') ||
        specifier.startsWith('@/') ||
        specifier === 'react' ||
        specifier.startsWith('react/')
      ) {
        continue;
      }
      dependencies.add(packageName(specifier));
    }
  }
  return dependencies;
}

function isIncluded(file, include) {
  return include.some((entry) => {
    const normalized = entry.replace(/^\.\//, '').replace(/\/$/, '');
    return file === normalized || file.startsWith(`${normalized}/`);
  });
}

async function walkFiles(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const item = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path.join(directory, entry.name), item)));
    } else {
      files.push(item);
    }
  }
  return files;
}

function dependencyName(value) {
  const match = value.match(/^(@[^/]+\/[^@]+|[^@]+)@/);
  if (!match) {
    throw new Error(`Registry dependency must include a version: ${value}`);
  }
  return match[1];
}

function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
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
