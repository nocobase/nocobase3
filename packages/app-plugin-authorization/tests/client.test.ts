import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('registers its client bootstrap and settings route', () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(routes).toMatchObject([
      {
        name: 'permission-sets',
        path: '/settings/authorization/permission-sets',
      },
    ]);
    expect(providers).toEqual([]);
  });
});
