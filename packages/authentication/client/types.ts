import type { AppClient } from '@nocobase/app-sdk';

export interface AuthClientOptions {
  client: AppClient;
}

export interface AuthSessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface AuthSession {
  user: AuthSessionUser;
  session: {
    id: string;
    expiresAt: string;
  };
}
