export interface DatabaseIntegrationTestArguments {
  readonly testFiles: string[];
  readonly vitestArguments: string[];
  readonly pauseOnFailure: boolean;
}

/**
 * Splits arguments owned by the database integration wrapper from arguments
 * that should be passed through to Vitest unchanged.
 */
export function parseDatabaseIntegrationArguments(
  arguments_: readonly string[],
): DatabaseIntegrationTestArguments {
  const testFiles: string[] = [];
  const vitestArguments: string[] = [];
  let pauseOnFailure = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--pause-on-failure') {
      pauseOnFailure = true;
      continue;
    }
    if (argument === '--test-file') {
      const file = arguments_[index + 1];
      if (!file || file.startsWith('-'))
        throw new Error('--test-file requires a file path.');
      testFiles.push(file);
      index += 1;
      continue;
    }
    if (argument.startsWith('--test-file=')) {
      const file = argument.slice('--test-file='.length);
      if (!file) throw new Error('--test-file requires a file path.');
      testFiles.push(file);
      continue;
    }
    vitestArguments.push(argument);
  }

  return { testFiles, vitestArguments, pauseOnFailure };
}
