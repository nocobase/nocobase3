import type { AppClient } from '@nocobase/app-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from '../auth-client.js';

describe('AuthClient', () => {
  it('sends a JSON body when signing out', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue(undefined);
    const client = createAuthClient({ client: { request } });

    await client.signOut();

    expect(request).toHaveBeenCalledWith('auth/sign-out', {
      method: 'POST',
      body: '{}',
    });
  });
});
