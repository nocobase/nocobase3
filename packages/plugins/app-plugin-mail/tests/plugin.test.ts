import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-mail', () => {
  it('declares the Mail Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-mail',
      serviceProviders: expect.any(Array),
    });
    expect(plugin.routes).toHaveLength(1);
    expect(plugin.queue).toBeUndefined();
    expect(plugin.database).toEqual({
      migrations: './database/migrations',
    });
  });
});
