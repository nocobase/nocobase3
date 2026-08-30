import { describe, expect, it } from 'vitest';

import providers from '../server/providers/index.js';
import routes from '../server/routes/index.js';
import systemInfoPlugin from '../server/plugin.js';

describe('@nocobase/app-plugin-system-info', () => {
  it('declares its server contributions', () => {
    expect(systemInfoPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-system-info',
      providers,
      routes,
    });
    expect(systemInfoPlugin.database).toBeUndefined();
    expect(systemInfoPlugin.queue).toBeUndefined();
  });
});
