import { useRegister } from '@refinedev/core';

import { resolveAuthenticationActionError } from './action-state.js';
import type {
  AuthenticationActionState,
  PasswordRegistrationInput,
} from './types.js';

export function usePasswordRegistration(): AuthenticationActionState<PasswordRegistrationInput> {
  const mutation = useRegister<PasswordRegistrationInput>();

  return {
    error: resolveAuthenticationActionError(mutation.data, mutation.error),
    isPending: mutation.isPending,
    submit: async (input: PasswordRegistrationInput): Promise<void> => {
      await mutation.mutateAsync(input).catch(() => undefined);
    },
  };
}
