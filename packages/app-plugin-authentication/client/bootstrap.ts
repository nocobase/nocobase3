import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { createAuthClient } from './auth-client.js';
import { createAuthProvider } from './auth-provider.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient, refine }) => {
  const authClient = createAuthClient({ client: appClient });

  refine.setAuthProvider(createAuthProvider(authClient));
};

export default bootstrap;
