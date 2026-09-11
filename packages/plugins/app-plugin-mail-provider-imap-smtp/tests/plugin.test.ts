import { describe, expect, it } from 'vitest';

import plugin from '../server/index.js';

describe('@nocobase/app-plugin-mail-provider-imap-smtp', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-mail-provider-imap-smtp',
      config: expect.any(Object),
      serviceProviders: expect.any(Array),
    });
  });
});
