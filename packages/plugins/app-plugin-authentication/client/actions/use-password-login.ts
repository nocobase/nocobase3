import { useState } from 'react';
import { useAuthentication } from '../auth-provider.js';
import { resolveAuthenticationActionError } from './errors.js';
import type { AuthenticationActionState, PasswordLoginInput } from './types.js';
export function usePasswordLogin(): AuthenticationActionState<PasswordLoginInput> {
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
        const id = input.identifier;
        if (id.includes('@'))
          await client.signIn.email(
            { email: id, password: input.password },
            { throw: true },
          );
        else
          await client.signIn.username(
            { username: id, password: input.password },
            { throw: true },
          );
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
