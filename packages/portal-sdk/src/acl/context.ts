import { createContext, useContext, useSyncExternalStore } from "react";

import type { RecordPermissionResolver } from "./evaluator.ts";
import type { AclState } from "./types.ts";

export type AclStore = {
  getState: () => AclState;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<AclState>;
  retry: () => Promise<AclState>;
  clear: () => void;
  recordPermissions: {
    getState: () => object;
    subscribe: (listener: () => void) => () => void;
    getPermission: RecordPermissionResolver;
  };
};

export const AclStoreContext: React.Context<AclStore | undefined> =
  createContext<AclStore | undefined>(undefined);

export const useAclStore = (): AclStore => {
  const store = useContext(AclStoreContext);
  if (!store) {
    throw new Error("useAclStore must be used within an AclStoreProvider");
  }
  return store;
};

export const useAclState = (): AclState => {
  const store = useAclStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
};
