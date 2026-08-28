import { describe, expect, it } from 'vitest';
import { formatHelp, parseInput } from '../src/lib/flags.ts';

describe('parseInput', () => {
  it('parses the target directory', async () => {
    const input = await parseInput(['my-hub']);

    expect(input.directory).toBe('my-hub');
  });

  it('installs by default and honours --no-install', async () => {
    expect((await parseInput(['my-hub'])).flags.install).toBe(true);
    expect((await parseInput(['my-hub', '--no-install'])).flags.install).toBe(
      false,
    );
  });

  it('uses the current Hub release by default', async () => {
    expect((await parseInput(['my-hub'])).flags.template).toBe(
      '@nocobase/hub@latest',
    );
  });

  it('accepts template and registry overrides', async () => {
    const input = await parseInput([
      'my-hub',
      '--template=./packages/hub/dist',
      '--registry=https://registry.npmjs.org',
    ]);

    expect(input.flags.template).toBe('./packages/hub/dist');
    expect(input.flags.registry).toBe('https://registry.npmjs.org');
  });

  it('supports -h and --version', async () => {
    expect((await parseInput(['-h'])).flags.help).toBe(true);
    expect((await parseInput(['--version'])).flags.version).toBe(true);
  });

  it('rejects flags outside the approved interface', async () => {
    await expect(parseInput(['my-hub', '--port=13001'])).rejects.toThrow();
    await expect(
      parseInput(['my-hub', '--template-tag=beta']),
    ).rejects.toThrow();
    await expect(parseInput(['my-hub', '--unknown'])).rejects.toThrow();
  });

  it('rejects a second positional argument', async () => {
    await expect(parseInput(['my-hub', 'extra'])).rejects.toThrow();
  });
});

describe('formatHelp', () => {
  it('documents the complete public interface and examples', () => {
    const help = formatHelp('create-hub');

    expect(help).toContain('create-hub my-hub');
    expect(help).toContain('--[no-]install');
    expect(help).toContain('--template');
    expect(help).toContain('--registry');
    expect(help).toContain('https://npm.nocobase.ai');
    expect(help).not.toContain('--host');
    expect(help).not.toContain('--port');
    expect(help).not.toContain('--template-tag');
  });
});
