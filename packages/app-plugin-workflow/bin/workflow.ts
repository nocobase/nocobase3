#!/usr/bin/env node
import process from 'node:process';

import { checkWorkflowPackage } from '../server/loader/source-check.js';
import { WorkflowSourceCheckError } from '../server/loader/source-issues.js';

async function main(argv: readonly string[]): Promise<void> {
  const [command, packagePath] = argv;
  if (command !== 'check' || !packagePath) {
    throw new Error('Usage: workflow check <workflow-package>');
  }
  const result = await checkWorkflowPackage(packagePath);
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
