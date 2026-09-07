import { expect, it } from 'vitest';
import plugin from '../server/index.js';
it('declares storage migrations without starting active services', () => {
  expect(plugin).toMatchObject({
    packageName: '@nocobase/app-plugin-audit',
    serviceProviders: expect.arrayContaining([expect.any(Function)]),
    database: { migrations: './server/database/migrations' },
  });
});
