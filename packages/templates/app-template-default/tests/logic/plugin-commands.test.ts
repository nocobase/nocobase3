// @vitest-environment node

// internal-docs/cli/README.md tells users to install and remove plugins by running these scripts inside their app. Nothing at
// runtime depends on them, so dropping one — a bad merge resolution did exactly that once — breaks the documented
// workflow silently: the app still builds, starts, and passes every other test. These assertions are the alarm.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

interface AppPackageJson {
  readonly files?: readonly string[];
  readonly scripts?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const appPackage = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
) as AppPackageJson;

const scripts = appPackage.scripts ?? {};

/** The command surface documented in internal-docs/cli/README.md, mapped to what it must run. */
const DOCUMENTED_SCRIPTS: Readonly<Record<string, string>> = {
  'plugin:register': 'nocobase plugin register',
  'plugin:inspect': 'nocobase plugin inspect',
  'plugin:unregister': 'nocobase plugin unregister',
  'plugin:update': 'nocobase plugin update',
  'plugin:skills:sync': 'nocobase plugin skills sync',
  nocobase: 'tsx ./cli/index.ts',
  'client:inspect': 'pnpm nocobase app inspect client',
  'server:inspect': 'pnpm nocobase app inspect server',
  migrate: 'pnpm nocobase app migrate',
  seed: 'pnpm nocobase app seed',
  'scheduler:sync':
    'tsx --tsconfig tsconfig.server.json ./scripts/scheduler-sync.ts',
};

describe('documented plugin commands', () => {
  it.each(Object.entries(DOCUMENTED_SCRIPTS))('exposes %s', (name, command) => {
    expect(scripts[name]).toBe(command);
  });

  it('declares the CLI that the plugin scripts invoke', () => {
    const usesCli = Object.entries(scripts).filter(([, command]) =>
      /(^|&&\s*)nocobase\s/.test(command),
    );

    expect(usesCli.length).toBeGreaterThan(0);
    // A runtime dependency, not tooling: `cli/index.ts` imports it and `dist/cli` ships to a deployment,
    // which installs from `dependencies` alone.
    expect(appPackage.dependencies?.['@nocobase/nb3-cli']).toBeTruthy();
  });

  it('ships the inspector that client:inspect runs', () => {
    const entry = path.join(
      appRoot,
      'cli/dev-commands/inspect-client-impl.mjs',
    );

    expect(existsSync(entry)).toBe(true);
    // A generated app only receives what `files` lists, so an unlisted directory is present here and missing there.
    expect(appPackage.files).toContain('cli');
  });

  it('ships a one-shot Schedule sync command with finalize support', () => {
    const entry = path.join(appRoot, 'scripts/scheduler-sync.ts');
    expect(existsSync(entry)).toBe(true);
    const source = readFileSync(entry, 'utf8');
    expect(source).toContain("process.argv.includes('--finalize')");
    expect(source).toContain("kind: 'sync-only'");
  });

  it('keeps synchronized Agent state out of source control and publication', () => {
    expect(readFileSync(path.join(appRoot, '.gitignore'), 'utf8')).toContain(
      '/.agents/',
    );
    expect(readFileSync(path.join(appRoot, '.npmignore'), 'utf8')).toContain(
      '.agents/',
    );
    expect(appPackage.files).not.toContain('.agents');
  });
});
