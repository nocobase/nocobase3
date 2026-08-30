import { describe, expect, it } from 'vitest';

import notificationProvidersPlugin from '../server/index.js';

describe('@nocobase/app-plugin-notification-providers server plugin', () => {
  it('registers its routes as an API contribution', () => {
    expect(notificationProvidersPlugin.routes).toHaveLength(1);
    expect(notificationProvidersPlugin.routes[0]?.scope).toBe('api');
  });
});
