import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { runExampleCommand } from '../../examples/command.js';

const execFileAsync = promisify(execFile);

describe.sequential('@nocobase/db examples command', () => {
  beforeAll(async () => {
    await mkdir('examples/tmp', { recursive: true });
  });

  it('lists the available examples', async () => {
    const result = await runExample('list');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Available @nocobase/db examples:');
    expect(result.stdout).toContain('managed');
    expect(result.stdout).toContain('external');
  });

  it('runs the managed Collection lifecycle', async () => {
    const existingResults = await readdir('examples/tmp');
    const result = await runExample('managed', '--cleanup');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Applied migration');
    expect(result.stdout).toContain('Loaded Database Metadata revision');
    expect(result.stdout).toContain('Resolved orders');
    expect(result.stdout).toContain('Reopened the database');
    await expect(readdir('examples/tmp')).resolves.toEqual(existingResults);
  });

  it('runs the external Module Metadata lifecycle', async () => {
    const existingResults = await readdir('examples/tmp');
    const result = await runExample('external', '--cleanup');

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Created external CRM physical Schema');
    expect(result.stdout).toContain('Module Metadata');
    expect(result.stdout).toContain('Inserted and selected records');
    expect(result.stdout).toContain('write protection');
    await expect(readdir('examples/tmp')).resolves.toEqual(existingResults);
  });

  it('retains results by default', async () => {
    const result = await runExample('external');
    const databasePath = result.stdout
      .split('\n')
      .find((line) => line.startsWith('Database retained at: '))
      ?.slice('Database retained at: '.length)
      .trim();

    try {
      expect(databasePath).toBeTruthy();
      await expect(access(databasePath!)).resolves.toBeUndefined();
    } finally {
      if (databasePath) {
        await rm(path.dirname(databasePath), { recursive: true, force: true });
      }
    }
  });

  it('cleans retained results from an isolated directory', async () => {
    await mkdir('examples/tmp', { recursive: true });
    const testRoot = await mkdtemp('examples/tmp/command-test-');
    const output: string[] = [];
    try {
      await mkdir(path.join(testRoot, 'managed-result'));
      await mkdir(path.join(testRoot, 'external-result'));

      await runExampleCommand(['clean'], {
        write: (message) => output.push(message),
        tempDirectoryRoot: testRoot,
      });

      expect(output).toContain('Removed 2 retained example result(s).');
      await expect(readdir(testRoot)).resolves.toEqual([]);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});

async function runExample(
  ...args: readonly string[]
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'examples/command.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
}
