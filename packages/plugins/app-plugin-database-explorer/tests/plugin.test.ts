import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-database-explorer', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-database-explorer',
      locales: expect.any(Function),
      routes: expect.any(Array),
    });
  });
});
