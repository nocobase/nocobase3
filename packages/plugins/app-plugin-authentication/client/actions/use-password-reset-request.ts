import { useState } from 'react';
import { resolveAppUrl } from '@nocobase/app-client';
import { useAuthentication } from '../auth-provider.js';
import { resolveAuthenticationActionError } from './errors.js';
import type { PasswordResetRequestActionState } from './types.js';
export function usePasswordResetRequest(): PasswordResetRequestActionState {
  const { client } = useAuthentication();
  const [state, setState] = useState<{
    error?: { message: string };
    pending: boolean;
    success: boolean;
  }>({ pending: false, success: false });
  return {
    error: state.error,
    isPending: state.pending,
    isSuccess: state.success,
    submit: async (input) => {
      setState({ pending: true, success: false });
      try {
        await client.requestPasswordReset(
          {
            ...input,
            redirectTo: `${window.location.origin}${resolveAppUrl('/reset-password')}`,
          },
          { throw: true },
        );
        setState({ pending: false, success: true });
      } catch (error) {
        setState({
          pending: false,
          success: false,
          error: resolveAuthenticationActionError(error),
        });
      }
    },
  };
}
