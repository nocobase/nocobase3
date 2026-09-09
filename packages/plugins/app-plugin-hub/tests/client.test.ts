import { describe, expect, it } from 'vitest';
import { Boxes } from 'lucide-react';

import routes from '../client/routes.js';
import plugin from '../client/plugin.js';

describe('@nocobase/app-plugin-hub', () => {
  it('declares its translated menu directly on the route without a menu provider', () => {
    expect(routes.routes[0]).toMatchObject({
      navigation: { title: 'navigation.applications', icon: Boxes },
    });
    expect(plugin.serviceProviders).toBeUndefined();
  });
});
