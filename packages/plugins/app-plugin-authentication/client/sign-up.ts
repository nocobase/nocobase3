import { useClientApplication } from '@nocobase/app-client';

/**
 * Whether the server accepts password sign-up, from the `auth` fields it publishes.
 *
 * Both have to allow it: password authentication enabled and sign-up not disabled. A field the server does not publish
 * reads as Better Auth's default, which allows sign-up, so an application that has not declared its `auth` section
 * with `defineAuthConfig` keeps showing registration.
 */
export function useSignUpAvailable(): boolean {
  const config = useClientApplication().config.public;
  const read = (path: string): unknown =>
    config.has(path) ? config.get<unknown>(path) : undefined;
  return (
    read('auth.emailAndPassword.enabled') !== false &&
    read('auth.emailAndPassword.disableSignUp') !== true
  );
}
