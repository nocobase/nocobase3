import { useLogin } from '@refinedev/core';

import { resolveAuthenticationActionError } from './action-state.js';
import type { AuthenticationActionState, PasswordLoginInput } from './types.js';

export function usePasswordLogin(): AuthenticationActionState<PasswordLoginInput> {
  const mutation = useLogin<PasswordLoginInput>();

  return {
    error: resolveAuthenticationActionError(mutation.data, mutation.error),
    isPending: mutation.isPending,
    submit: async (input: PasswordLoginInput): Promise<void> => {
      await mutation.mutateAsync(input).catch(() => undefined);
    },
  };
}
