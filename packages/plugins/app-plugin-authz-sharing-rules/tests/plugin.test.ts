import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-authz-sharing-rules', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-authz-sharing-rules',
      database: {
        migrations: './database/migrations',
        seeds: './database/seeds',
      },
    });
  });
});
