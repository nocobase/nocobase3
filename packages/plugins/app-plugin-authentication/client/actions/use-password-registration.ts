import { useState } from 'react';
import { useAuthentication } from '../auth-provider.js';
import { resolveAuthenticationActionError } from './errors.js';
import type {
  AuthenticationActionState,
  PasswordRegistrationInput,
} from './types.js';
export function usePasswordRegistration(): AuthenticationActionState<PasswordRegistrationInput> {
  const { client, refresh } = useAuthentication();
  const [state, setState] = useState<{
    error?: { message: string };
    pending: boolean;
  }>({ pending: false });
  return {
    error: state.error,
    isPending: state.pending,
    submit: async (input) => {
      setState({ pending: true });
      try {
        await client.signUp.email(input, { throw: true });
        await refresh();
        setState({ pending: false });
      } catch (error) {
        setState({
          pending: false,
          error: resolveAuthenticationActionError(error),
        });
      }
    },
  };
}
