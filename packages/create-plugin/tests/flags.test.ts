import { describe, expect, it } from 'vitest';

import { formatHelp, parseCreatePluginArgs } from '../src/lib/flags.ts';

describe('parseCreatePluginArgs', () => {
  it('parses and de-duplicates explicit capabilities', () => {
    expect(
      parseCreatePluginArgs([
        '@nocobase/app-plugin-audit-log',
        '--with',
        'server.providers',
        '--with',
        'server.routes',
        '--with',
        'server.routes',
        '--display-name',
        'Audit Log',
        '--description',
        'Tracks changes.',
        '--no-install',
        '--dry-run',
        '--json',
      ]),
    ).toEqual({
      flags: {
        capabilities: ['server.providers', 'server.routes'],
        description: 'Tracks changes.',
        displayName: 'Audit Log',
        dryRun: true,
        empty: false,
        help: false,
        install: false,
        json: true,
        version: false,
      },
      name: '@nocobase/app-plugin-audit-log',
    });
  });

  it('allows an explicitly empty package foundation', () => {
    expect(parseCreatePluginArgs(['audit-log', '--empty']).flags).toMatchObject(
      {
        capabilities: [],
        empty: true,
      },
    );
  });

  it('allows help and version without a plugin name or capability', () => {
    expect(parseCreatePluginArgs(['--help']).flags.help).toBe(true);
    expect(parseCreatePluginArgs(['--version']).flags.version).toBe(true);
  });

  it('rejects implicit, unknown, missing, and conflicting capabilities', () => {
    expect(() => parseCreatePluginArgs(['audit-log'])).toThrow(
      'No plugin capabilities were selected',
    );
    expect(() =>
      parseCreatePluginArgs(['audit-log', '--with', 'server.service']),
    ).toThrow('Unknown plugin capability: server.service');
    expect(() => parseCreatePluginArgs(['audit-log', '--with'])).toThrow(
      '--with requires a capability value',
    );
    expect(() =>
      parseCreatePluginArgs(['audit-log', '--empty', '--with', 'database']),
    ).toThrow('--empty cannot be combined with --with');
  });
});

describe('formatHelp', () => {
  it('documents the explicit capability contract', () => {
    const help = formatHelp('pnpm plugin:create');
    expect(help).toContain(
      'pnpm plugin:create <name> (--with <capability>... | --empty) [options]',
    );
    expect(help).toContain('server.providers');
    expect(help).toContain('client.bootstrap');
    expect(help).toContain('--json');
  });
});
