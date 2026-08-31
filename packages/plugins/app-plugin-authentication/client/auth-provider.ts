import { resolveAppUrl } from '@nocobase/app-client';
import type { AuthProvider } from '@refinedev/core';
import type { AuthClient } from './auth-client.js';

export function createAuthProvider(client: AuthClient): AuthProvider {
  type CurrentUser = NonNullable<
    Awaited<ReturnType<AuthClient['getSession']>>
  >['user'];
  let currentUser: CurrentUser | null | undefined;
  let currentRequest: Promise<typeof currentUser> | undefined;

  const getUser = async () => {
    if (currentUser !== undefined) {
      return currentUser;
    }
    currentRequest ??= client
      .getSession()
      .then((session) => {
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
        await client.signIn(
          String(params?.identifier ?? params?.email ?? params?.username ?? ''),
          String(params?.password ?? ''),
        );
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
        await client.signUp(
          String(params?.name ?? ''),
          String(params?.username ?? ''),
          String(params?.email ?? ''),
          String(params?.password ?? ''),
        );
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
          String(params?.email ?? ''),
          resolveAppUrl('/reset-password'),
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
          String(params?.newPassword ?? params?.password ?? ''),
          String(
            params?.token ??
              new URLSearchParams(window.location.search).get('token') ??
              '',
          ),
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
      await client.signOut();
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
    message: error instanceof Error ? error.message : fallback,
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
