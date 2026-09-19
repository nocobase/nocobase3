import type { ClientApplication } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';
import { AuthenticationServiceProvider } from '../service-provider.js';

describe('client ServiceProvider', () => {
  it('initializes the Better Auth client without Refine', async () => {
    const app = {
      config: { get: () => undefined },
      container: { singleton: () => undefined },
    } as unknown as ClientApplication;
    await expect(
      new AuthenticationServiceProvider(app).boot(),
    ).resolves.toBeUndefined();
  });
});
