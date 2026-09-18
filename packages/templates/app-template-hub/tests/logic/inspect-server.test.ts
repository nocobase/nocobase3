// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  formatAppServerInspection,
  inspectAppServer,
} from '../../cli/dev-commands/inspect-server-impl.mjs';

describe('Server inspection', () => {
  it('inspects the real Server composition without runtime execution', async () => {
    const inspection = await inspectAppServer();

    expect(inspection.app.packageName).toBe('@nocobase/app-template-hub');
    expect(inspection.issues).toEqual([]);
    expect(inspection.consistent).toBe(true);
    expect(inspection.suggestions).toEqual([]);
    expect(inspection.plugins[0]).toMatchObject({
      order: 1,
      packageName: '@nocobase/app-plugin-authentication',
    });
    expect(inspection.plugins.map(({ packageName }) => packageName)).toEqual([
      '@nocobase/app-plugin-authentication',
      '@nocobase/app-plugin-authorization',
      '@nocobase/app-plugin-users',
      '@nocobase/app-plugin-i18n',
      '@nocobase/app-plugin-install',
      '@nocobase/app-plugin-hub',
    ]);
    expect(inspection.routes.map(({ order }) => order)).toEqual(
      inspection.routes.map((_route, index) => index + 1),
    );
    expect(
      inspection.routes.some(
        ({ packageName, scope }) =>
          packageName === '@nocobase/app-plugin-install' && scope === 'root',
      ),
    ).toBe(true);
    expect(inspection).not.toHaveProperty('limitations');
    expect(inspection.plugins[0]).not.toHaveProperty('rootDir');
    expect(Array.isArray(inspection.locales)).toBe(true);
    expect(inspection).not.toHaveProperty('jobs');
    for (const plugin of inspection.plugins) {
      expect(plugin.contributions).not.toHaveProperty('jobLocations');
    }
    const formatted = formatAppServerInspection(inspection);
    expect(formatted).not.toContain('   jobs:');
    expect(formatted).toContain(
      'Runtime Provider, Route, locale, database, and Job behavior is not inspected.',
    );
    expect(formatted).toContain('locales:');
  });
});
