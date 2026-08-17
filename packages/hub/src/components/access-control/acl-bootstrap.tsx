import { useEffect, type PropsWithChildren } from "react";
import { useAclState, useAclStore } from "@nocobase/portal-sdk/acl";

import { AclGate } from "./acl-gate";

export function AclBootstrap({ children }: PropsWithChildren) {
  const store = useAclStore();
  const state = useAclState();

  useEffect(() => {
    if (state.status === "idle") {
      store.load();
    }
  }, [state.status, store]);

  return <AclGate>{children}</AclGate>;
}
