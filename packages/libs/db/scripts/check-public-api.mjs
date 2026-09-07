import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import ts from 'typescript';

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const configPath = path.join(packageDirectory, 'tsconfig.json');
const manifestPath = path.join(packageDirectory, 'package.json');
const baselinePath = path.join(packageDirectory, 'scripts', 'public-api.json');
const compareNames = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function formatDiagnostic(diagnostic) {
  return ts.formatDiagnostic(diagnostic, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => packageDirectory,
    getNewLine: () => '\n',
  });
}

function createProgram() {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostic(configFile.error));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageDirectory,
  );
  if (parsedConfig.errors.length > 0) {
    throw new Error(parsedConfig.errors.map(formatDiagnostic).join('\n'));
  }

  return ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
}

function entrySourcePath(entry) {
  const target = entry.types ?? entry.import;
  if (typeof target !== 'string' || !target.startsWith('./src/')) {
    throw new Error(
      `Package entry must resolve to source TypeScript: ${target}`,
    );
  }
  return path.join(packageDirectory, target);
}

function readPublicApi(program, packageExports) {
  const checker = program.getTypeChecker();
  const entries = {};

  for (const entryName of Object.keys(packageExports).sort(compareNames)) {
    const sourcePath = entrySourcePath(packageExports[entryName]);
    const source = program.getSourceFile(sourcePath);
    if (!source) {
      throw new Error(`Cannot read public API entry: ${sourcePath}`);
    }

    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) {
      throw new Error(`Cannot resolve public API module: ${sourcePath}`);
    }

    const values = [];
    const types = [];
    for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
      const typeOnly = exportedSymbol.declarations?.some((declaration) => {
        if (ts.isExportSpecifier(declaration)) {
          return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly;
        }
        return ts.isExportDeclaration(declaration) && declaration.isTypeOnly;
      });
      const target =
        exportedSymbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exportedSymbol)
          : exportedSymbol;
      const list =
        !typeOnly && target.flags & ts.SymbolFlags.Value ? values : types;
      list.push(exportedSymbol.getName());
    }

    entries[entryName] = {
      source: path.relative(packageDirectory, sourcePath),
      values: values.sort(compareNames),
      types: types.sort(compareNames),
    };
  }

  return entries;
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function formatList(title, items) {
  return items.length === 0
    ? []
    : [title, ...items.map((item) => `    - ${item}`)];
}

function compareEntry(name, actual, expected) {
  if (!actual) return [`  - Removed entry ${name}`];
  if (!expected) return [`  - Added entry ${name}`];

  const lines = [];
  if (actual.source !== expected.source) {
    lines.push(
      `  - ${name}: source changed from ${expected.source} to ${actual.source}`,
    );
  }
  lines.push(
    ...formatList(
      `  - ${name}: added values`,
      difference(actual.values, expected.values),
    ),
    ...formatList(
      `  - ${name}: removed values`,
      difference(expected.values, actual.values),
    ),
    ...formatList(
      `  - ${name}: added types`,
      difference(actual.types, expected.types),
    ),
    ...formatList(
      `  - ${name}: removed types`,
      difference(expected.types, actual.types),
    ),
  );
  return lines;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const actualEntries = readPublicApi(createProgram(), manifest.exports);

if (process.argv.includes('--write')) {
  const baseline = {
    version: 2,
    note: 'Public package-entry baseline. Every exported value and type must be intentionally classified before this file is updated.',
    entries: actualEntries,
  };
  await writeFile(
    baselinePath,
    await format(JSON.stringify(baseline), {
      filepath: baselinePath,
      parser: 'json',
    }),
  );
  const exportCount = Object.values(actualEntries).reduce(
    (total, entry) => total + entry.values.length + entry.types.length,
    0,
  );
  const entryCount = Object.keys(actualEntries).length;
  console.log(
    `Updated ${path.relative(packageDirectory, baselinePath)} with ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} and ${exportCount} exports.`,
  );
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const expectedEntries = baseline.entries ?? {};
const entryNames = [
  ...new Set([...Object.keys(actualEntries), ...Object.keys(expectedEntries)]),
].sort(compareNames);
const changes = entryNames.flatMap((name) =>
  compareEntry(name, actualEntries[name], expectedEntries[name]),
);

if (changes.length > 0) {
  console.error(
    [
      'The @nocobase/db public package entries changed.',
      ...changes,
      '',
      'Classify the change before updating the baseline with `pnpm api:update`.',
    ].join('\n'),
  );
  process.exit(1);
}

const exportCount = Object.values(actualEntries).reduce(
  (total, entry) => total + entry.values.length + entry.types.length,
  0,
);
const entryCount = Object.keys(actualEntries).length;
console.log(
  `Public API baseline matches (${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}, ${exportCount} exports).`,
);
