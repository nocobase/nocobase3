import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import {
  parseDatabaseIntegrationArguments,
  type DatabaseIntegrationTestArguments,
} from '@nocobase/db-testkit/integration-runner';

let parsed: DatabaseIntegrationTestArguments;
try {
  parsed = parseDatabaseIntegrationArguments(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  process.exit();
}
const result = await runVitest(parsed.vitestArguments, parsed.testFiles);

if (parsed.pauseOnFailure && result !== 0) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    console.error('[db-testkit] Press Enter to exit.');
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      await readline.question('');
    } finally {
      readline.close();
    }
  } else {
    console.error(
      '[db-testkit] --pause-on-failure was requested, but no interactive terminal is available.',
    );
  }
}

process.exitCode = result;

function runVitest(
  arguments_: readonly string[],
  testFiles: readonly string[],
): Promise<number> {
  const environment = {
    ...process.env,
    ...(testFiles.length > 0
      ? { DB_TEST_FILES: JSON.stringify(testFiles) }
      : {}),
  };
  const hasReporter = arguments_.some(
    (argument) =>
      argument === '--reporter' || argument.startsWith('--reporter='),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        'tests/integration/core-suite.test.ts',
        ...(hasReporter ? [] : ['--reporter=verbose']),
        ...arguments_,
      ],
      { stdio: 'inherit', env: environment },
    );
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}
