// @vitest-environment node

// docs/cli/README.md tells users to install and remove plugins by running these scripts inside their app. Nothing at
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

/** The command surface documented in docs/cli/README.md, mapped to what it must run. */
const DOCUMENTED_SCRIPTS: Readonly<Record<string, string>> = {
  'plugin:register': 'nb3 app plugin register',
  'plugin:inspect': 'nb3 app plugin inspect',
  'plugin:unregister': 'nb3 app plugin unregister',
  'plugin:update': 'nb3 app plugin update',
  'plugin:skills:sync': 'nb3 app plugin skills sync',
  'client:inspect': 'tsx ./scripts/inspect-client.mjs',
  'server:inspect': 'tsx ./scripts/inspect-server.mjs',
};

describe('documented plugin commands', () => {
  it.each(Object.entries(DOCUMENTED_SCRIPTS))('exposes %s', (name, command) => {
    expect(scripts[name]).toBe(command);
  });

  it('declares the CLI that the plugin scripts invoke', () => {
    const usesCli = Object.entries(scripts).filter(([, command]) =>
      /(^|&&\s*)nb3\s/.test(command),
    );

    expect(usesCli.length).toBeGreaterThan(0);
    expect(appPackage.devDependencies?.['@nocobase/nb3-cli']).toBeTruthy();
  });

  it('ships the inspector that client:inspect runs', () => {
    const entry = path.join(appRoot, 'scripts/inspect-client.mjs');

    expect(existsSync(entry)).toBe(true);
    // A generated app only receives what `files` lists, so an unlisted script is present here and missing there.
    expect(appPackage.files).toContain('scripts');
  });
});
