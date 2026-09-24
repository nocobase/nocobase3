// @vitest-environment node

// Users install and remove plugins by running these scripts inside their app. Nothing at
// runtime depends on them, so dropping one — a bad merge resolution did exactly that once — breaks the documented
// workflow silently: the app still builds, starts, and passes every other test. These assertions are the alarm.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

interface AppPackageJson {
  readonly files?: readonly string[];
  readonly publishConfig?: unknown;
  readonly scripts?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const appPackage = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
) as AppPackageJson;

const scripts = appPackage.scripts ?? {};

/** The application's plugin command surface, mapped to what it must run. */
const DOCUMENTED_SCRIPTS: Readonly<Record<string, string>> = {
  'plugin:register': 'nocobase plugin register',
  'plugin:inspect': 'nocobase plugin inspect',
  'plugin:unregister': 'nocobase plugin unregister',
  'plugin:update': 'nocobase plugin update',
  'skills:sync': 'nocobase skills sync',
  'package:remove': 'nocobase package remove',
  nocobase: 'tsx ./cli/index.ts',
  // Straight at the CLI entry, not through `pnpm nocobase`: a script calling another script is a
  // second `pnpm run`, and each layer prints its own ELIFECYCLE line for one non-zero exit.
  'db:apply': 'tsx ./cli/index.ts app db apply',
  'db:reset': 'tsx ./cli/index.ts app db reset',
  'db:repair': 'tsx ./cli/index.ts app db repair',
  'db:rollback': 'tsx ./cli/index.ts app db rollback',
  'db:redo': 'tsx ./cli/index.ts app db redo',
  'db:unlock': 'tsx ./cli/index.ts app db unlock',
  'db:doctor': 'tsx ./cli/index.ts app db doctor',
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

  it('keeps synchronized Agent state out of source control and publication', () => {
    expect(readFileSync(path.join(appRoot, '.gitignore'), 'utf8')).toContain(
      '/.agents/',
    );
    const npmIgnorePath = path.join(appRoot, '.npmignore');
    if (appPackage.publishConfig) {
      expect(existsSync(npmIgnorePath)).toBe(true);
      expect(readFileSync(npmIgnorePath, 'utf8')).toContain('.agents/');
    }
    expect(appPackage.files).not.toContain('.agents');
  });
});
