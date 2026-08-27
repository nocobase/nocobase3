import { createAppClient } from '@nocobase/app-sdk';
import {
  createAuthClient,
  createAuthProvider,
} from '@nocobase/app-plugin-authentication/client';

export const appClient = createAppClient();
export const authClient = createAuthClient({ client: appClient });
export const authProvider = createAuthProvider(authClient);
