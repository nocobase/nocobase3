// @vitest-environment jsdom
import { useSettingsActions } from '../client/components/use-settings-actions.js';
import {
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import { ServiceContainer } from '@nocobase/service-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationClient,
  authorizationClientToken,
  useCan,
  type AuthorizationCheck,
} from '../client/index.js';

const check: AuthorizationCheck = {
  resource: { type: 'page', id: 'orders' },
  action: 'access',
};
const snapshot = {
  data: {
    unrestricted: false,
    permissions: [{ resource: check.resource, actions: ['access'] }],
  },
};

function setup() {
  const request = vi.fn().mockResolvedValue(snapshot);
  const client = new AuthorizationClient({ request } as never);
  const services = new ServiceContainer();
  services.instance(authorizationClientToken, client);
  const app = { services } as unknown as ClientApplication;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ClientApplicationContext.Provider value={app}>
      {children}
    </ClientApplicationContext.Provider>
  );
  return { request, client, wrapper };
}

describe('useCan without a Refine provider', () => {
  it('clears management actions immediately during revalidation and when the settings resource changes', async () => {
    const { wrapper, client } = setup();
    const can = vi.spyOn(client, 'can').mockResolvedValue(true);
    const { result, rerender } = renderHook(
      (id: string) => useSettingsActions(id),
      { wrapper, initialProps: 'first' },
    );
    await waitFor(() => expect(result.current.update).toBe(true));
    const pending = Promise.withResolvers<boolean>();
    can.mockReturnValue(pending.promise);
    act(() => client.invalidatePermissions());
    expect(Object.values(result.current).every((allowed) => !allowed)).toBe(
      true,
    );
    await act(async () => pending.resolve(false));
    can.mockResolvedValue(true);
    act(() => client.invalidatePermissions());
    await waitFor(() => expect(result.current.update).toBe(true));
    can.mockResolvedValue(false);
    rerender('second');
    expect(result.current.update).toBe(false);
    await waitFor(() =>
      expect(can).toHaveBeenCalledWith({
        resource: { type: 'settings', id: 'second' },
        action: 'update',
      }),
    );
  });

  it('shares a permission snapshot and revokes immediately while revalidating', async () => {
    const { wrapper, request, client } = setup();
    const { result } = renderHook(() => [useCan(check), useCan(check)], {
      wrapper,
    });
    expect(result.current[0]!.can).toBe(false);
    await waitFor(() =>
      expect(result.current.every((value) => value.can)).toBe(true),
    );
    expect(request).toHaveBeenCalledTimes(1);
    const pending = Promise.withResolvers<typeof snapshot>();
    request.mockReturnValue(pending.promise);
    act(() => client.invalidatePermissions());
    expect(result.current[0]).toMatchObject({ can: false, isPending: true });
    await act(async () =>
      pending.resolve({ data: { unrestricted: false, permissions: [] } }),
    );
    await waitFor(() =>
      expect(result.current[0]).toMatchObject({ can: false, isPending: false }),
    );
  });

  it('discards old resource results and denies failed checks until retry succeeds', async () => {
    const { wrapper, client } = setup();
    const old = Promise.withResolvers<boolean>();
    const can = vi
      .spyOn(client, 'can')
      .mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(true);
    const { result, rerender } = renderHook(
      (input: AuthorizationCheck) => useCan(input),
      { wrapper, initialProps: check },
    );
    rerender({ resource: { type: 'page', id: 'users' }, action: 'access' });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    await act(async () => old.resolve(true));
    expect(result.current.can).toBe(false);
    act(() => result.current.retry());
    expect(result.current).toMatchObject({ can: false, isPending: true });
    await waitFor(() => expect(result.current.can).toBe(true));
    expect(can).toHaveBeenLastCalledWith({
      resource: { type: 'page', id: 'users' },
      action: 'access',
    });
  });

  it('does not query disabled checks and rechecks when enabled again', async () => {
    const { wrapper, client } = setup();
    const can = vi.spyOn(client, 'can').mockResolvedValue(true);
    const { result, rerender } = renderHook(
      (enabled: boolean) => useCan(check, { enabled }),
      { wrapper, initialProps: false },
    );
    expect(result.current).toMatchObject({ can: false, isPending: false });
    expect(can).not.toHaveBeenCalled();
    rerender(true);
    await waitFor(() => expect(result.current.can).toBe(true));
    rerender(false);
    can.mockResolvedValue(false);
    rerender(true);
    expect(result.current.can).toBe(false);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.can).toBe(false);
    expect(can).toHaveBeenCalledTimes(2);
  });
});
