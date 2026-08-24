import { describe, expect, it } from 'vitest';

import {
  AUTHENTICATION_PAGE_ROUTE_IDS,
  defineAuthenticationPageOverrides,
} from '../ui/index.js';

describe('authentication client UI', () => {
  it('maps partial page overrides to stable route IDs', () => {
    const login = async () => ({ default: () => null });
    const resetPassword = async () => ({ default: () => null });
    const overrides = defineAuthenticationPageOverrides({
      login: {
        componentEntry: './client/auth/pages/login-page',
        componentLoader: login,
      },
      resetPassword,
    });

    expect(overrides).toEqual([
      {
        routeId: AUTHENTICATION_PAGE_ROUTE_IDS.login,
        componentEntry: './client/auth/pages/login-page',
        componentLoader: login,
      },
      {
        routeId: AUTHENTICATION_PAGE_ROUTE_IDS.resetPassword,
        componentEntry: undefined,
        componentLoader: resetPassword,
      },
    ]);
    expect(Object.isFrozen(overrides)).toBe(true);
    expect(Object.isFrozen(overrides[0])).toBe(true);
  });
});
