// @vitest-environment jsdom
import {
  apiClientToken,
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import { ServiceContainer } from '@nocobase/service-provider';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import {
  AuthorizationClient,
  authorizationClientToken,
  useAuthorizationClient,
} from '../client/index.js';
import { useDefaultAccessClient } from '../../app-plugin-authz-default-access/client/api.js';
import { useSharingRulesClient } from '../../app-plugin-authz-sharing-rules/client/api.js';
import { useRestrictionRulesClient } from '../../app-plugin-authz-restriction-rules/client/api.js';

function application() {
  const request = vi.fn().mockResolvedValue({ data: [] });
  const api = { request };
  const authorization = new AuthorizationClient(api as never);
  const services = new ServiceContainer();
  services.instance(apiClientToken, api as never);
  services.instance(authorizationClientToken, authorization);
  return {
    app: { services } as unknown as ClientApplication,
    request,
    authorization,
  };
}

it('resolves authorization and rule clients from the current application without module-level state', async () => {
  const first = application();
  const second = application();
  let app = first.app;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ClientApplicationContext.Provider value={app}>
      {children}
    </ClientApplicationContext.Provider>
  );
  const { result, rerender } = renderHook(
    () => ({
      authorization: useAuthorizationClient(),
      defaults: useDefaultAccessClient(),
      sharing: useSharingRulesClient(),
      restrictions: useRestrictionRulesClient(),
    }),
    { wrapper },
  );
  const original = result.current;
  expect(original.authorization).toBe(first.authorization);
  rerender();
  expect(result.current.defaults).toBe(original.defaults);
  await result.current.defaults.listDefaultAccess();
  expect(first.request).toHaveBeenCalledWith({ path: 'authz/default-access' });
  app = second.app;
  rerender();
  expect(result.current.authorization).toBe(second.authorization);
  expect(result.current.defaults).not.toBe(original.defaults);
  await result.current.defaults.listDefaultAccess();
  await result.current.sharing.listSharingRules();
  await result.current.restrictions.listRestrictionRules();
  expect(second.request.mock.calls).toEqual([
    [{ path: 'authz/default-access' }],
    [{ path: 'authz/sharing-rules' }],
    [{ path: 'authz/restriction-rules' }],
  ]);
  expect(first.request).toHaveBeenCalledTimes(1);
});
