import type { AppClient } from '@nocobase/app-client';

export interface AuthClientOptions {
  client: AppClient;
}

export interface AuthSessionUser {
  id: string;
  name: string;
  username?: string | null;
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
