import { useAuthenticatorSignIn } from "@nocobase/portal-sdk/auth";

export function useLdapSignIn(authenticator: string) {
  return useAuthenticatorSignIn(authenticator);
}
