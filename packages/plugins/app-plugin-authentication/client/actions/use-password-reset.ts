import { useUpdatePassword } from '@refinedev/core';

import { resolveAuthenticationActionError } from './action-state.js';
import type { AuthenticationActionState, PasswordResetInput } from './types.js';

interface RefinePasswordResetInput {
  readonly newPassword: string;
  readonly token: string;
}

export function usePasswordReset(): AuthenticationActionState<PasswordResetInput> {
  const mutation = useUpdatePassword<RefinePasswordResetInput>();

  return {
    error: resolveAuthenticationActionError(mutation.data, mutation.error),
    isPending: mutation.isPending,
    submit: async (input: PasswordResetInput): Promise<void> => {
      await mutation
        .mutateAsync({ newPassword: input.password, token: input.token })
        .catch(() => undefined);
    },
  };
}
