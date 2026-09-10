import { resolveAppUrl, type RealtimeClient } from '@nocobase/app-client';
import type { AuthProvider } from '@refinedev/core';
import type { AuthClient } from './auth-client.js';

export function createAuthProvider(
  client: AuthClient,
  realtime: Pick<RealtimeClient, 'reconnect'>,
): AuthProvider {
  type User = AuthClient['$Infer']['Session']['user'];
  let currentUser: User | null | undefined;
  let currentRequest: Promise<typeof currentUser> | undefined;

  const getUser = async () => {
    if (currentUser !== undefined) {
      return currentUser;
    }
    currentRequest ??= client
      .getSession({ fetchOptions: { throw: true } })
      .then((session) => {
        if (!session) realtime.reconnect();
        currentUser = session?.user ?? null;
        return currentUser;
      })
      .finally(() => {
        currentRequest = undefined;
      });
    return currentRequest;
  };

  const clear = () => {
    currentUser = undefined;
    currentRequest = undefined;
  };

  return {
    login: async (params) => {
      try {
        const identifier = String(
          params?.identifier ?? params?.email ?? params?.username ?? '',
        );
        const password = String(params?.password ?? '');
        if (identifier.includes('@')) {
          await client.signIn.email(
            { email: identifier, password },
            { throw: true },
          );
        } else {
          await client.signIn.username(
            { username: identifier, password },
            { throw: true },
          );
        }
        realtime.reconnect();
        clear();
        return { success: true, redirectTo: params?.redirectTo ?? '/' };
      } catch (error) {
        return {
          success: false,
          error: authError(error, 'Unable to sign in.'),
        };
      }
    },
    register: async (params) => {
      try {
        await client.signUp.email(
          {
            name: String(params?.name ?? ''),
            username: String(params?.username ?? ''),
            email: String(params?.email ?? ''),
            password: String(params?.password ?? ''),
          },
          { throw: true },
        );
        realtime.reconnect();
        clear();
        return { success: true, redirectTo: params?.redirectTo ?? '/login' };
      } catch (error) {
        return {
          success: false,
          error: authError(error, 'Unable to create the account.'),
        };
      }
    },
    forgotPassword: async (params) => {
      try {
        await client.requestPasswordReset(
          {
            email: String(params?.email ?? ''),
            redirectTo: new URL(
              resolveAppUrl('/reset-password'),
              window.location.origin,
            ).href,
          },
          { throw: true },
        );
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: authError(error, 'Unable to send the reset link.'),
        };
      }
    },
    updatePassword: async (params) => {
      try {
        await client.resetPassword(
          {
            newPassword: String(params?.newPassword ?? params?.password ?? ''),
            token: String(
              params?.token ??
                new URLSearchParams(window.location.search).get('token') ??
                '',
            ),
          },
          { throw: true },
        );
        clear();
        return { success: true, redirectTo: '/login' };
      } catch (error) {
        return {
          success: false,
          error: authError(error, 'Unable to reset the password.'),
        };
      }
    },
    logout: async () => {
      await client.signOut({}, { throw: true });
      realtime.reconnect();
      clear();
      return { success: true, redirectTo: '/login' };
    },
    check: async () => {
      try {
        return (await getUser())
          ? { authenticated: true }
          : { authenticated: false, redirectTo: '/login' };
      } catch (error) {
        clear();
        return {
          authenticated: false,
          redirectTo: '/login',
          error: authError(error, 'Unable to check authentication.'),
        };
      }
    },
    getIdentity: async () => {
      const user = await getUser();
      return user
        ? {
            id: user.id,
            fullName: user.name,
            firstName: user.name,
            lastName: '',
            email: user.email,
            avatar: user.image ?? undefined,
          }
        : null;
    },
    onError: async (error) => {
      if (isUnauthorized(error)) {
        realtime.reconnect();
        clear();
        return { logout: true, redirectTo: '/login' };
      }
      return { error };
    },
  };
}

function authError(error: unknown, fallback: string) {
  return {
    name: 'AuthenticationError',
    message:
      nativeErrorMessage(error) ??
      (error instanceof Error ? error.message : fallback),
  };
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 401
  );
}

function nativeErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('error' in error))
    return undefined;
  const body = error.error;
  return typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
    ? body.message
    : undefined;
}
