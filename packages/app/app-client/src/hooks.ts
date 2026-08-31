import type { ServiceToken } from '@nocobase/service-provider';
import { useContext } from 'react';

import type { ClientApplication } from './application.js';
import { ClientApplicationContext } from './application-context.js';

export function useClientApplication(): ClientApplication {
  const app = useContext(ClientApplicationContext);
  if (!app) {
    throw new Error(
      'useClientApplication() must be used inside AppClientRoot.',
    );
  }
  return app;
}

export function useService<T>(token: ServiceToken<T>): T {
  return useClientApplication().services.resolve(token);
}
