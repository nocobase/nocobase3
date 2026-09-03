#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';

const runningFromSource: boolean = import.meta.url.endsWith('.ts');
if (runningFromSource) {
  const tsxEsmSpecifier: string = 'tsx/esm';
  await import(tsxEsmSpecifier);
}

const buildEntryUrl: URL = new URL('../build/index.js', import.meta.url);
if (runningFromSource) {
  buildEntryUrl.pathname = buildEntryUrl.pathname.replace(/\.js$/, '.ts');
}

const {
  buildApplicationWorkflows,
  checkWorkflowPackage,
  WorkflowSourceCheckError,
} = (await import(buildEntryUrl.href)) as typeof import('../build/index.js');

function readOption(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a path`);
  return value;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  if (command === 'check') {
    const packagePath = argv[1];
    if (!packagePath)
      throw new Error('Usage: workflow check <workflow-package>');
    const result = await checkWorkflowPackage(path.resolve(packagePath));
    process.stdout.write(
      `Workflow check passed: ${result.file} (${result.ir.nodes.length} nodes)\n`,
    );
    return;
  }
  if (command === 'build') {
    const cwd = process.cwd();
    const sourceRoot = path.resolve(
      cwd,
      readOption(argv, '--source-root') ?? 'server/workflows',
    );
    const distRoot = path.resolve(
      cwd,
      readOption(argv, '--dist-root') ?? 'dist/server/workflows',
    );
    const resourceRoot = readOption(argv, '--resource-root');
    const result = await buildApplicationWorkflows({
      sourceRoot,
      distRoot,
      ...(resourceRoot === undefined
        ? {}
        : { resourceRoot: path.resolve(cwd, resourceRoot) }),
    });
    process.stdout.write(
      `Workflow build generated ${result.packages} Artifact(s) in ${distRoot}\n`,
    );
    return;
  }
  throw new Error(
    'Usage: workflow check <workflow-package> | workflow build [--source-root <path>] [--dist-root <path>] [--resource-root <path>]',
  );
}

await main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof WorkflowSourceCheckError ? error.message : error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
