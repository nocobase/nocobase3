import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";

import { getUserFormValues } from "./form-context";
import type { UserFormValues, UserRecord } from "./types";

export function useUserFormHydration({
  form,
  id,
  record,
}: {
  form: Pick<UseFormReturn<UserFormValues>, "reset">;
  id?: string;
  record?: UserRecord;
}) {
  const hydratedIdRef = useRef<string | undefined>(undefined);
  const { reset } = form;

  useEffect(() => {
    if (!id || !record || String(record.id) !== id) return;
    if (hydratedIdRef.current === id) return;

    reset(getUserFormValues(record));
    hydratedIdRef.current = id;
  }, [id, record, reset]);
}
