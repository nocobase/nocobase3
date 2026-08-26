import {
  createAuthClient,
  createAuthProvider,
} from '@nocobase/app-plugin-authentication/client';
import { createAppClient } from '@nocobase/app-sdk';

export const appClient = createAppClient();
export const authClient = createAuthClient({ client: appClient });

export const authProvider = createAuthProvider(authClient);
