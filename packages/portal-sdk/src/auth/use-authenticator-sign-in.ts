import { useLogin } from '@refinedev/core';
import type { AuthActionResponse, HttpError } from '@refinedev/core';

type SignInValues = Record<string, unknown>;

export type UseAuthenticatorSignInResult = {
  signIn: (values: SignInValues) => Promise<AuthActionResponse>;
  isPending: boolean;
  error: Error | HttpError | null;
};

export function useAuthenticatorSignIn(
  authenticator: string,
): UseAuthenticatorSignInResult {
  const mutation = useLogin<SignInValues & { authenticator: string }>();

  return {
    signIn: (values: SignInValues) =>
      mutation.mutateAsync({ ...values, authenticator }),
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
