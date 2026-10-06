import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-approval', () => {
  it('contributes its collections through a migration', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-approval',
      database: {
        migrations: './database/migrations',
      },
    });
  });
});
