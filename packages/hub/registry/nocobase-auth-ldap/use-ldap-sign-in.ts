import { useAuthenticatorSignIn } from '@nocobase/app-portal-sdk/auth';

export function useLdapSignIn(authenticator: string) {
  return useAuthenticatorSignIn(authenticator);
}
