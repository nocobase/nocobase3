import { expect, it } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import routes from '../client/routes.js';
it('gives each business menu its own page access check', () => {
  const result = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-authorization-example', routes },
  ]);
  const pages = result.routes.find(
    (route) => route.name === 'authorization-example',
  )!.children!;
  for (const name of ['projects', 'quotes', 'orders']) {
    expect(
      pages.find((route) => route.name === `authorization-example-${name}`),
    ).toMatchObject({
      auth: 'required',
      path: `/authorization-example/${name}`,
      access: { resource: `page:example.sales.${name}`, action: 'access' },
    });
  }
  expect(
    result.routes.some(
      (route) => route.path === '/authorization-example/sales',
    ),
  ).toBe(false);
});
