import { useForgotPassword } from '@refinedev/core';

import { resolveAuthenticationActionError } from './action-state.js';
import type {
  PasswordResetRequestActionState,
  PasswordResetRequestInput,
} from './types.js';

export function usePasswordResetRequest(): PasswordResetRequestActionState {
  const mutation = useForgotPassword<PasswordResetRequestInput>();

  return {
    error: resolveAuthenticationActionError(mutation.data, mutation.error),
    isPending: mutation.isPending,
    isSuccess: mutation.data?.success === true,
    submit: async (input: PasswordResetRequestInput): Promise<void> => {
      await mutation.mutateAsync(input).catch(() => undefined);
    },
  };
}
