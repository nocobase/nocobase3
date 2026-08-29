import { describe, expect, it } from 'vitest';

import providers from '../server/providers/index.js';
import routes from '../server/routes/index.js';
import auditLogPlugin from '../server/plugin.js';

describe('@nocobase/app-plugin-audit-log', () => {
  it('declares its server contributions', () => {
    expect(auditLogPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-audit-log',
      providers,
      routes,
    });
    expect(auditLogPlugin.database).toEqual({
      migrations: './database/migrations',
      seeds: './database/seeds',
    });
    expect(auditLogPlugin.queue).toEqual({
      jobs: ['./server/jobs'],
    });
  });
});
