import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePasswordResetRequest } from '../../actions/use-password-reset-request.js';

const requestPasswordReset = vi.hoisted(() => vi.fn());
vi.mock('@nocobase/app-client', () => ({
  resolveAppUrl: (path: string) => `/main${path}`,
}));
vi.mock('../../auth-provider.js', () => ({
  useAuthentication: () => ({ client: { requestPasswordReset } }),
}));

describe('usePasswordResetRequest', () => {
  it('uses the application reset page as the callback URL', async () => {
    requestPasswordReset.mockReset().mockResolvedValue({});
    const { result } = renderHook(() => usePasswordResetRequest());
    await act(async () =>
      result.current.submit({ email: 'alice@example.com' }),
    );
    expect(requestPasswordReset).toHaveBeenCalledExactlyOnceWith(
      {
        email: 'alice@example.com',
        redirectTo: `${window.location.origin}/main/reset-password`,
      },
      { throw: true },
    );
    expect(result.current.isSuccess).toBe(true);
  });
});
