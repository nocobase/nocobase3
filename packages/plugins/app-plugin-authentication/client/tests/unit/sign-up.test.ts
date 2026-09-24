import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAppClientConfig } from '@nocobase/app-client';

const useClientApplication = vi.hoisted(() => vi.fn());
vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useClientApplication,
}));

const { useSignUpAvailable } = await import('../../sign-up.js');

function withPublished(rawPublicConfig: Record<string, unknown>): void {
  useClientApplication.mockReturnValue({
    config: createAppClientConfig({ rawConfig: {}, rawPublicConfig }),
  });
}

describe('useSignUpAvailable', () => {
  it.each([
    [{}, true],
    [{ auth: { emailAndPassword: { enabled: true } } }, true],
    [{ auth: { emailAndPassword: { disableSignUp: true } } }, false],
    [{ auth: { emailAndPassword: { enabled: false } } }, false],
    [
      { auth: { emailAndPassword: { enabled: true, disableSignUp: false } } },
      true,
    ],
  ])('reads %j as sign-up available: %s', (published, expected) => {
    withPublished(published);

    expect(renderHook(() => useSignUpAvailable()).result.current).toBe(
      expected,
    );
  });
});
