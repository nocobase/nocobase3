import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** Use published declarations so workspace source imports cannot hide a missing public dependency path. */
function installDeclarations(
  applicationRoot,
  relativePackage,
  outputDirectory,
) {
  const packageRoot = path.join(repoRoot, 'packages', relativePackage);
  const manifest = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const installedPackage = path.join(
    applicationRoot,
    'node_modules',
    manifest.name,
  );
  mkdirSync(installedPackage, { recursive: true });
  writeFileSync(
    path.join(installedPackage, 'package.json'),
    JSON.stringify({ ...manifest, ...manifest.publishConfig }),
  );
  const sourceRoot = path.join(packageRoot, 'src');
  for (const entry of readdirSync(sourceRoot, { recursive: true })) {
    if (!entry.endsWith('.ts')) continue;
    const declaration = ts.transpileDeclaration(
      readFileSync(path.join(sourceRoot, entry), 'utf8'),
      { fileName: entry },
    );
    const output = path.join(
      installedPackage,
      outputDirectory,
      entry.replace(/\.ts$/, '.d.ts'),
    );
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, declaration.outputText);
  }
  symlinkSync(
    path.join(packageRoot, 'node_modules'),
    path.join(installedPackage, 'node_modules'),
    'dir',
  );
}

test('a generated Hub emits portable database declarations with its declared dependencies', (t) => {
  const templateRoot = path.join(
    repoRoot,
    'packages/templates/app-template-hub',
  );
  const root = mkdtempSync(path.join(tmpdir(), 'hub-database-declarations-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = JSON.parse(
    readFileSync(path.join(templateRoot, 'package.json'), 'utf8'),
  );
  // Keep the actual dependency categories: TypeScript discovers runtime dependency
  // symlinks when naming inferred types, but does not scan devDependencies this way.
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  installDeclarations(root, 'app/app-server', 'dist');
  installDeclarations(root, 'libs/db-sqlite', 'dist/src');
  symlinkSync(
    realpathSync(path.join(templateRoot, 'node_modules/@nocobase/db')),
    path.join(root, 'node_modules/@nocobase/db'),
    'dir',
  );
  const file = path.join(root, 'database.ts');
  writeFileSync(
    file,
    readFileSync(path.join(templateRoot, 'server/config/database.ts')),
  );
  const program = ts.createProgram([file], {
    strict: true,
    skipLibCheck: true,
    declaration: true,
    emitDeclarationOnly: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    types: [],
    outDir: path.join(root, 'dist'),
  });
  const result = program.emit();
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...result.diagnostics,
  ];
  assert.deepEqual(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
    [],
  );
  const declaration = readFileSync(
    path.join(root, 'dist/database.d.ts'),
    'utf8',
  );
  assert.ok(declaration.includes('import("@nocobase/db").ConnectionConfig'));
  assert.ok(!declaration.includes('node_modules'));
});
