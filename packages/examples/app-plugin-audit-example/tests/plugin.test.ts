// @vitest-environment node
import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-audit-example', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-audit-example',
      serviceProviders: expect.any(Array),
      routes: expect.any(Array),
      database: {
        migrations: './database/migrations',
      },
      queue: { jobs: ['./server/jobs'] },
    });
  });
});
