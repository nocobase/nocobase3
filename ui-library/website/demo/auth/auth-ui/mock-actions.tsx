import { useState } from 'react';

interface ActionState {
  readonly error?: { message: string };
  readonly isPending: boolean;
}

function useDemoAction(): ActionState & {
  readonly submit: (input: unknown) => Promise<void>;
} {
  const [state, setState] = useState<ActionState>({ isPending: false });
  return {
    ...state,
    submit: async () => {
      setState({ isPending: true });
      await Promise.resolve();
      setState({ isPending: false });
    },
  };
}

export function usePasswordLogin() {
  return useDemoAction();
}

export function usePasswordRegistration() {
  return useDemoAction();
}

export function usePasswordReset() {
  return useDemoAction();
}

export function usePasswordResetRequest() {
  const action = useDemoAction();
  return { ...action, isSuccess: false };
}
