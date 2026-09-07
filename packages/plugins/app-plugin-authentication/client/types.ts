import type { ApiClient, RealtimeClient } from '@nocobase/app-client';

export interface AuthClientOptions {
  api: ApiClient;
  realtime: RealtimeClient;
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
