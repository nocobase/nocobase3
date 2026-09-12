import type { AuthClientOptions, AuthSession } from './types.js';

export class AuthClient {
  constructor(private readonly options: AuthClientOptions) {}

  async getSession(): Promise<AuthSession | null> {
    return this.send<AuthSession | null>('get-session');
  }

  async signIn(identifier: string, password: string): Promise<AuthSession> {
    const isEmail = identifier.includes('@');
    const session = await this.send<AuthSession>(
      isEmail ? 'sign-in/email' : 'sign-in/username',
      isEmail
        ? { email: identifier, password }
        : { username: identifier, password },
    );
    this.options.realtime.reconnect();
    return session;
  }

  async signUp(
    name: string,
    username: string,
    email: string,
    password: string,
  ): Promise<AuthSession> {
    const session = await this.send<AuthSession>('sign-up/email', {
      name,
      username,
      email,
      password,
    });
    this.options.realtime.reconnect();
    return session;
  }

  async signOut(): Promise<void> {
    await this.send('sign-out', {});
    this.options.realtime.reconnect();
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    await this.send('request-password-reset', { email, redirectTo });
  }

  async resetPassword(newPassword: string, token: string): Promise<void> {
    await this.send('reset-password', { newPassword, token });
  }

  refreshRealtimeSession(): void {
    this.options.realtime.reconnect();
  }

  private async send<T>(path: string, json?: unknown): Promise<T> {
    return this.options.api.request<T>({
      path: `auth/${path}`,
      ...(json === undefined ? {} : { method: 'POST', json }),
    });
  }
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  return new AuthClient(options);
}
