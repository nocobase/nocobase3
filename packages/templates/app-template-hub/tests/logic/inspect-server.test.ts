// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  formatAppServerInspection,
  inspectAppServer,
  parseInspectAppServerArgs,
} from '../../scripts/inspect-server.mjs';

describe('Server inspection', () => {
  it('parses JSON and help options', () => {
    expect(parseInspectAppServerArgs(['--json'])).toEqual({
      help: false,
      json: true,
    });
    expect(parseInspectAppServerArgs(['--help'])).toEqual({
      help: true,
      json: false,
    });
    expect(() => parseInspectAppServerArgs(['--type', 'routes'])).toThrow(
      'Unknown argument: --type',
    );
  });

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
    expect(
      inspection.plugins.find(
        ({ packageName }) =>
          packageName === '@nocobase/app-plugin-queue-example',
      ),
    ).toMatchObject({ contributions: { jobLocations: 1 } });
    expect(
      inspection.serviceProviders.find(
        ({ packageName }) => packageName === '@nocobase/app-plugin-system-info',
      ),
    ).toMatchObject({ constructorName: 'SystemInfoProvider' });
    expect(inspection.routes.map(({ order }) => order)).toEqual(
      inspection.routes.map((_route, index) => index + 1),
    );
    expect(
      inspection.routes
        .filter(
          ({ packageName }) =>
            packageName === '@nocobase/app-plugin-routes-example',
        )
        .map(({ scope }) => scope),
    ).toEqual(['root', 'api']);
    expect(
      inspection.routes.some(
        ({ packageName, scope }) =>
          packageName === '@nocobase/app-plugin-install' && scope === 'root',
      ),
    ).toBe(true);
    expect(inspection).not.toHaveProperty('limitations');
    expect(inspection.plugins[0]).not.toHaveProperty('rootDir');
    expect(Array.isArray(inspection.locales)).toBe(true);
    expect(formatAppServerInspection(inspection)).toContain(
      'Runtime Provider, Route, locale, database, and Job behavior is not inspected.',
    );
    expect(formatAppServerInspection(inspection)).toContain('locales:');
  });
});
