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

    expect(inspection.app.packageName).toBe('@nocobase/app-template-default');
    expect(inspection.issues).toEqual([]);
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
      inspection.providers.find(
        ({ packageName }) => packageName === '@nocobase/app-plugin-system-info',
      ),
    ).toMatchObject({ constructorName: 'SystemInfoProvider' });
    expect(
      inspection.routes.api.some(
        ({ packageName }) =>
          packageName === '@nocobase/app-plugin-routes-example',
      ),
    ).toBe(true);
    expect(inspection.limitations).toHaveLength(3);
    expect(formatAppServerInspection(inspection)).toContain(
      'SERVER_ROUTE_METADATA_UNAVAILABLE',
    );
  });
});
