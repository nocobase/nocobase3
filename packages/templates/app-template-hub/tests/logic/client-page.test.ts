import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import { describeRoutePage } from '../../client/routing/client-page.js';

const page = (
  overrides: Partial<AppClientRegisteredRoute> = {},
): AppClientRegisteredRoute => ({
  name: 'orders',
  id: 'orders',
  path: '/orders',
  auth: 'required',
  packageName: 'test',
  source: 'application',
  componentLoader: async () => ({ default: () => null }),
  ...overrides,
});

describe('describeRoutePage', () => {
  it('authorizes an undeclared page as its own name', () => {
    expect(describeRoutePage(page())).toMatchObject({
      access: { resource: 'orders', action: 'access' },
      checkAccess: true,
    });
  });

  it('authorizes a declared page as the resource it names', () => {
    expect(
      describeRoutePage(
        page({ access: { resource: 'orders.board', action: 'read' } }),
      ),
    ).toMatchObject({
      access: { resource: 'orders.board', action: 'read' },
      checkAccess: true,
    });
    // An explicit rule is checked even where the default check is off, such as a page nested under another page.
    expect(
      describeRoutePage(
        page({ access: { resource: 'orders.board', action: 'read' } }),
        false,
      ).checkAccess,
    ).toBe(true);
  });

  it('checks nothing for a page that declared `access: false`', () => {
    // Signed in is enough. No grant can take the page away, so it is not authorized at all.
    expect(describeRoutePage(page({ access: false }))).toMatchObject({
      access: { resource: 'orders', action: 'access' },
      checkAccess: false,
    });
    expect(describeRoutePage(page({ access: false }), false).checkAccess).toBe(
      false,
    );
  });

  it('leaves a guest page unchecked whatever it declared', () => {
    expect(describeRoutePage(page({ auth: 'guest' })).checkAccess).toBe(false);
  });

  it('checks a nested page only when it declares its own rule', () => {
    expect(describeRoutePage(page(), false).checkAccess).toBe(false);
  });
});
