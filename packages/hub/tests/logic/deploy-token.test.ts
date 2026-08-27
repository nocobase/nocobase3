import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDeployTokenForCommand,
  readRememberedDeployToken,
  rememberDeployToken,
} from '../../client/features/apps/deploy-token';

describe('deploy token command storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.NOCOBASE_PORTAL_BASE = '/hub/';
    vi.unstubAllGlobals();
  });

  it('remembers a created App token for directly runnable commands', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    rememberDeployToken('crm', 'created-deploy-token');

    expect(readRememberedDeployToken('crm')).toBe('created-deploy-token');
    await expect(getDeployTokenForCommand('crm')).resolves.toBe(
      'created-deploy-token',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('issues and remembers a token when the browser has none', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deployToken: 'issued-deploy-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(getDeployTokenForCommand('crm')).resolves.toBe(
      'issued-deploy-token',
    );
    expect(request).toHaveBeenCalledExactlyOnceWith(
      '/hub/api/apps/crm/deploy-token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'NocoBase3',
        },
        credentials: 'include',
      },
    );
    expect(readRememberedDeployToken('crm')).toBe('issued-deploy-token');

    await expect(getDeployTokenForCommand('crm')).resolves.toBe(
      'issued-deploy-token',
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not remember a failed token response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
        ),
    );

    await expect(getDeployTokenForCommand('crm')).rejects.toThrow(
      'Unable to issue a deployment token (403)',
    );
    expect(readRememberedDeployToken('crm')).toBeNull();
  });
});
