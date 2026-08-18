import type { PropsWithChildren } from "react";

import { AclStoreContext, type AclStore } from "./context.ts";

export function AclStoreProvider({
  children,
  store,
}: PropsWithChildren<{ store: AclStore }>): React.ReactElement {
  return (
    <AclStoreContext.Provider value={store}>
      {children}
    </AclStoreContext.Provider>
  );
}
