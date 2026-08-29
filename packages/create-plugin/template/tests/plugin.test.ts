import { describe, expect, it } from 'vitest';

import __NOCOBASE_SYMBOL_NAME__Provider from '../server/provider.js';
import __NOCOBASE_MODULE_NAME__ApiRoutes from '../server/routes.js';
import __NOCOBASE_MODULE_NAME__Plugin from '../server/plugin.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its server contributions', () => {
    expect(__NOCOBASE_MODULE_NAME__Plugin).toMatchObject({
      packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
      providers: [__NOCOBASE_SYMBOL_NAME__Provider],
      apiRoutes: [__NOCOBASE_MODULE_NAME__ApiRoutes],
      rootRoutes: [],
    });
    expect(__NOCOBASE_MODULE_NAME__Plugin.database).toBeUndefined();
    expect(__NOCOBASE_MODULE_NAME__Plugin.queue).toBeUndefined();
  });
});
