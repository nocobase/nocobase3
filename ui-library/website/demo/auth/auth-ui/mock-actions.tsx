import type {
  AuthenticationActionState,
  PasswordLoginInput,
  PasswordRegistrationInput,
  PasswordResetInput,
  PasswordResetRequestActionState,
  PasswordResetRequestInput,
} from '@nocobase/app-plugin-authentication/client/actions';
import { useState } from 'react';

// The static preview has no authentication server, so vite.config.ts points the plugin's `client/actions` export at
// this file. TypeScript still resolves the real module, which is what checks these signatures, and the registry forms
// that call them, against the plugin's contract.
function useDemoAction<Input>(): AuthenticationActionState<Input> {
  const [isPending, setIsPending] = useState(false);
  return {
    isPending,
    submit: async () => {
      setIsPending(true);
      await Promise.resolve();
      setIsPending(false);
    },
  };
}

export function usePasswordLogin(): AuthenticationActionState<PasswordLoginInput> {
  return useDemoAction();
}

export function usePasswordRegistration(): AuthenticationActionState<PasswordRegistrationInput> {
  return useDemoAction();
}

export function usePasswordReset(): AuthenticationActionState<PasswordResetInput> {
  return useDemoAction();
}

export function usePasswordResetRequest(): PasswordResetRequestActionState {
  return { ...useDemoAction<PasswordResetRequestInput>(), isSuccess: false };
}
