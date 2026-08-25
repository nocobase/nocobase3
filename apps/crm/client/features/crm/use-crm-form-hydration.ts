import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { CrmFormValues } from './record-form';
import type { CrmRecord } from './data';

export function useCrmFormHydration({
  form,
  id,
  record,
}: {
  form: Pick<UseFormReturn<CrmFormValues>, 'reset'>;
  id?: string;
  record?: CrmRecord;
}) {
  const hydratedIdRef = useRef<string | undefined>(undefined);
  const { reset } = form;

  useEffect(() => {
    if (!id || !record || String(record.id) !== id) return;
    if (hydratedIdRef.current === id) return;

    reset(record);
    hydratedIdRef.current = id;
  }, [id, record, reset]);
}
