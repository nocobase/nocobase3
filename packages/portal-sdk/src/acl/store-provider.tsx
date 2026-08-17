import type { PropsWithChildren } from "react";

import { AclStoreContext, type AclStore } from "./context.ts";

export function AclStoreProvider({
  children,
  store,
}: PropsWithChildren<{ store: AclStore }>) {
  return (
    <AclStoreContext.Provider value={store}>
      {children}
    </AclStoreContext.Provider>
  );
}
