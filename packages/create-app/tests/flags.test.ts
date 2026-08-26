import { describe, expect, it } from 'vitest';
import { formatHelp, parseInput } from '../src/lib/flags.ts';

describe('parseInput', () => {
  /**
   * `pnpm create @nocobase/app crm --db-dialect=postgres` forwards everything after the package name verbatim, so this
   * is the exact argv the command receives in the documented invocation.
   */
  it('parses the directory argument and the dialect flag', async () => {
    const input = await parseInput(['crm', '--db-dialect=postgres']);

    expect(input.directory).toBe('crm');
    expect(input.flags['db-dialect']).toBe('postgres');
  });

  it('accepts the space-separated flag form', async () => {
    const input = await parseInput(['crm', '--db-dialect', 'sqlite']);

    expect(input.flags['db-dialect']).toBe('sqlite');
  });

  it('leaves the directory unset when it is omitted, so it can be prompted for', async () => {
    const input = await parseInput([]);

    expect(input.directory).toBeUndefined();
    expect(input.flags['db-dialect']).toBeUndefined();
  });

  it('installs by default and honours --no-install', async () => {
    expect((await parseInput(['crm'])).flags.install).toBe(true);
    expect((await parseInput(['crm', '--no-install'])).flags.install).toBe(
      false,
    );
  });

  it('parses the template and registry overrides', async () => {
    const input = await parseInput([
      'crm',
      '--template=./packages/app-template-default',
      '--registry=https://registry.npmjs.org',
    ]);

    expect(input.flags.template).toBe('./packages/app-template-default');
    expect(input.flags.registry).toBe('https://registry.npmjs.org');
  });

  /** The default is a name, so the package it points at stays an implementation detail. */
  it('defaults the template to the default name', async () => {
    expect((await parseInput(['crm'])).flags.template).toBe('default');
  });

  it('defaults the template tag to latest and accepts beta', async () => {
    expect((await parseInput(['crm'])).flags['template-tag']).toBe('latest');
    expect(
      (await parseInput(['crm', '--template-tag=beta'])).flags['template-tag'],
    ).toBe('beta');
  });

  /** oclif validates against the declared options, so a typo fails at parse time rather than at download. */
  it('rejects an unknown template tag', async () => {
    await expect(
      parseInput(['crm', '--template-tag=nightly']),
    ).rejects.toThrow();
  });

  it('supports -h and --version', async () => {
    expect((await parseInput(['-h'])).flags.help).toBe(true);
    expect((await parseInput(['--version'])).flags.version).toBe(true);
  });

  /** Strict parsing turns a typo into an error rather than silently ignoring it. */
  it('rejects an unknown flag', async () => {
    await expect(parseInput(['crm', '--db-type=postgres'])).rejects.toThrow();
  });

  it('rejects a second positional argument', async () => {
    await expect(parseInput(['crm', 'extra'])).rejects.toThrow();
  });
});

describe('formatHelp', () => {
  it('documents the flags and the registry default', () => {
    const help = formatHelp('create-app');

    expect(help).toContain('--db-dialect');
    expect(help).toContain('--template-tag');
    expect(help).toContain('default');
    expect(help).toContain('--[no-]install');
    expect(help).toContain('https://npm.nocobase.ai');
    expect(help).toContain('create-app crm');
  });
});
