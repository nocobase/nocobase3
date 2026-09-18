import { expect, it } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import routes from '../client/routes.js';

it('checks each standalone detail route against its list page permission', () => {
  const result = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-repository-example', routes },
  ]);
  for (const name of ['crm', 'orders', 'contacts', 'items', 'products']) {
    const detail = result.routes.find(
      (route) => route.name === `${name}-detail`,
    );
    expect(detail).toMatchObject({
      auth: 'required',
      authz: { resource: { type: 'page', id: name }, action: 'access' },
    });
    expect(detail?.navigation).toBeUndefined();
  }
});
