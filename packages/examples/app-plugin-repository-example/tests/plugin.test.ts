import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-repository-example', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-repository-example',
      routes: expect.any(Array),
      database: {
        migrations: './database/migrations',
        seeds: './database/seeds',
      },
    });
  });
});
