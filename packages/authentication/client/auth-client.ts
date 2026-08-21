import type { AuthClientOptions, AuthSession } from './types.js';

export class AuthClient {
  constructor(private readonly options: AuthClientOptions) {}

  async getSession(): Promise<AuthSession | null> {
    return this.send<AuthSession | null>('get-session');
  }

  async signIn(identifier: string, password: string): Promise<AuthSession> {
    const isEmail = identifier.includes('@');
    return this.send<AuthSession>(
      isEmail ? 'sign-in/email' : 'sign-in/username',
      {
        method: 'POST',
        body: JSON.stringify(
          isEmail
            ? { email: identifier, password }
            : { username: identifier, password },
        ),
      },
    );
  }

  async signUp(
    name: string,
    username: string,
    email: string,
    password: string,
  ): Promise<AuthSession> {
    return this.send<AuthSession>('sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name, username, email, password }),
    });
  }

  async signOut(): Promise<void> {
    await this.send('sign-out', { method: 'POST' });
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    await this.send('request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, redirectTo }),
    });
  }

  private async send<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.options.client.request<T>(`auth/${path}`, {
      ...init,
    });
  }
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  return new AuthClient(options);
}
