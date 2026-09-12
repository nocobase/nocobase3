import { describe, expect, it } from 'vitest';

import { AUTHENTICATION_ROUTE_IDS } from '../route-contracts.js';
import * as authenticationUi from '../ui/index.js';

describe('authentication client UI', () => {
  it('exports stable route IDs without owning application overrides', () => {
    expect(AUTHENTICATION_ROUTE_IDS).toEqual({
      forgotPassword: '@nocobase/app-plugin-authentication:forgot-password',
      login: '@nocobase/app-plugin-authentication:login',
      register: '@nocobase/app-plugin-authentication:register',
      resetPassword: '@nocobase/app-plugin-authentication:reset-password',
    });
    expect(Object.isFrozen(AUTHENTICATION_ROUTE_IDS)).toBe(true);
  });

  it('keeps application-owned forms out of the public UI entry', () => {
    expect(Object.keys(authenticationUi)).toEqual(['AuthLink']);
  });
});
