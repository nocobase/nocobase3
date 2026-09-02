import { describe, expect, it } from 'vitest';

import notificationProvidersPlugin from '../server/index.js';

describe('@nocobase/app-plugin-notification-providers server plugin', () => {
  it('contributes definitions through its service provider only', () => {
    expect(notificationProvidersPlugin.serviceProviders).toHaveLength(1);
    expect(notificationProvidersPlugin.routes).toEqual([]);
  });
});
