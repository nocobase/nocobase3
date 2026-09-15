import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-database-explorer', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-database-explorer',
      routes: expect.any(Array),
    });
  });

  it('registers no Server locales and no service provider', () => {
    // Errors answer with a stable code and the Client renders its wording, so
    // Server locale resources would be declared and never consulted. And the
    // plugin resolves what it needs per request rather than owning a service.
    expect(plugin.locales).toBeUndefined();
    expect(plugin.serviceProviders ?? []).toEqual([]);
  });
});
