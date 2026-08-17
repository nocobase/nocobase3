import type { NocoBaseRuntimeError } from "../client/error.ts";

export type PortalRuntimeState = {
  error?: NocoBaseRuntimeError;
};

export type PortalRuntimeStore = {
  clear: () => void;
  getState: () => PortalRuntimeState;
  setError: (error: NocoBaseRuntimeError) => void;
  subscribe: (listener: () => void) => () => void;
};

const listeners = new Set<() => void>();
let state: PortalRuntimeState = {};

const emit = () => listeners.forEach((listener) => listener());

export const portalRuntimeStore: PortalRuntimeStore = {
  getState: () => state,

  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setError: (error) => {
    state = { error };
    emit();
  },

  clear: () => {
    if (!state.error) return;
    state = {};
    emit();
  },
};
