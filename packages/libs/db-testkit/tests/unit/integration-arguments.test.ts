import { describe, expect, it } from 'vitest';
import { parseDatabaseIntegrationArguments } from '../../src/integration-arguments.js';

describe('parseDatabaseIntegrationArguments', () => {
  it('extracts repeated test-file and pause options', () => {
    expect(
      parseDatabaseIntegrationArguments([
        '--test-file',
        'tests/integration/schema/inspector.test.ts',
        '--test-file=tests/integration/query/count.test.ts',
        '--pause-on-failure',
        '-t',
        'indexes',
      ]),
    ).toEqual({
      testFiles: [
        'tests/integration/schema/inspector.test.ts',
        'tests/integration/query/count.test.ts',
      ],
      vitestArguments: ['-t', 'indexes'],
      pauseOnFailure: true,
    });
  });

  it('rejects a missing test-file value', () => {
    expect(() =>
      parseDatabaseIntegrationArguments(['--test-file', '--pause-on-failure']),
    ).toThrow('--test-file requires a file path.');
  });
});
