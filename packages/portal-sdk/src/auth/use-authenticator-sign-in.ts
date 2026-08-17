import { useLogin } from "@refinedev/core";

type SignInValues = Record<string, unknown>;

export function useAuthenticatorSignIn(authenticator: string) {
  const mutation = useLogin<SignInValues & { authenticator: string }>();

  return {
    signIn: (values: SignInValues) =>
      mutation.mutateAsync({ ...values, authenticator }),
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
