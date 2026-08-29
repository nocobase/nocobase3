import { describe, expect, it } from 'vitest';

import { formatHelp, parseCreatePluginArgs } from '../src/lib/flags.ts';

describe('parseCreatePluginArgs', () => {
  it('parses the supported scaffold options', () => {
    expect(
      parseCreatePluginArgs([
        '@nocobase/app-plugin-audit-log',
        '--display-name',
        'Audit Log',
        '--description',
        'Tracks changes.',
        '--no-install',
        '--dry-run',
      ]),
    ).toEqual({
      flags: {
        description: 'Tracks changes.',
        displayName: 'Audit Log',
        dryRun: true,
        help: false,
        install: false,
        version: false,
      },
      name: '@nocobase/app-plugin-audit-log',
    });
  });

  it('allows help and version without a plugin name', () => {
    expect(parseCreatePluginArgs(['--help']).flags.help).toBe(true);
    expect(parseCreatePluginArgs(['--version']).flags.version).toBe(true);
  });

  it('rejects missing names, option values, and unknown options', () => {
    expect(() => parseCreatePluginArgs([])).toThrow(
      'A plugin name is required.',
    );
    expect(() => parseCreatePluginArgs(['audit', '--description'])).toThrow(
      '--description requires a value.',
    );
    expect(() => parseCreatePluginArgs(['audit', '--unknown'])).toThrow(
      'Unknown option: --unknown',
    );
    expect(() => parseCreatePluginArgs(['audit', 'other'])).toThrow(
      'Expected exactly one plugin name.',
    );
  });
});

describe('formatHelp', () => {
  it('uses the caller-provided binary name', () => {
    expect(formatHelp('pnpm plugin:create')).toContain(
      'pnpm plugin:create <name> [options]',
    );
  });
});
