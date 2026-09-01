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

const { checkWorkflowPackage, WorkflowSourceCheckError } = (await import(
  buildEntryUrl.href
)) as typeof import('../build/index.js');

async function main(argv: readonly string[]): Promise<void> {
  const [command, packagePath] = argv;
  if (command !== 'check' || !packagePath) {
    throw new Error('Usage: workflow check <workflow-package>');
  }
  const result = await checkWorkflowPackage(path.resolve(packagePath));
  process.stdout.write(
    `Workflow check passed: ${result.file} (${result.ir.nodes.length} nodes)\n`,
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof WorkflowSourceCheckError ? error.message : error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
