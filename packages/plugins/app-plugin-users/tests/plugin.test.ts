import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-users', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-users',
      locales: expect.any(Function),
      serviceProviders: expect.any(Array),
      routes: expect.any(Array),
    });
  });

  it('publishes concrete App integration guidance instead of scaffold placeholders', async () => {
    const skill = await readFile(
      fileURLToPath(
        new URL(
          '../skills/nocobase-app-plugin-users/SKILL.md',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(skill).toContain('userRoleScopeRegistryToken');
    expect(skill).toContain('page:users/access');
    expect(skill).not.toContain('Development draft');
    expect(skill).not.toContain('Describe the App-level');
  });
});
