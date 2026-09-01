import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('@nocobase/db examples command', () => {
  it('lists the available examples', async () => {
    const result = await runExample('list');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Available @nocobase/db examples:');
    expect(result.stdout).toContain('managed');
    expect(result.stdout).toContain('external');
  });

  it('runs the managed Collection lifecycle', async () => {
    const result = await runExample('managed');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Applied migration');
    expect(result.stdout).toContain('Loaded Database Metadata revision');
    expect(result.stdout).toContain('Resolved orders');
    expect(result.stdout).toContain('Reopened the database');
  });

  it('runs the external Module Metadata lifecycle', async () => {
    const result = await runExample('external');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Created external CRM physical Schema');
    expect(result.stdout).toContain('Module Metadata');
    expect(result.stdout).toContain('Inserted and selected records');
    expect(result.stdout).toContain('write protection');
  });
});

async function runExample(
  name: 'list' | 'managed' | 'external',
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'examples/command.ts', name],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
}
