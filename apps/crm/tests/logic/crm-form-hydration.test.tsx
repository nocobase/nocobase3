import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import type { CrmFormValues } from '@/features/crm/record-form';
import type { CrmRecord } from '@/features/crm/data';
import { useCrmFormHydration } from '@/features/crm/use-crm-form-hydration';

function useHydratedForm({ id, record }: { id: string; record: CrmRecord }) {
  const form = useForm<CrmFormValues>({ defaultValues: {} });
  useCrmFormHydration({ form, id, record });
  return form;
}

describe('CRM form hydration', () => {
  it('hydrates once per record and preserves dirty edits across refreshes', async () => {
    const first = { id: 1, name: 'Initial', score: 66 };
    const { result, rerender } = renderHook(useHydratedForm, {
      initialProps: { id: '1', record: first },
    });

    await waitFor(() =>
      expect(result.current.getValues('name')).toBe('Initial'),
    );
    act(() => result.current.setValue('name', 'Unsaved draft'));

    rerender({
      id: '1',
      record: { ...first, name: 'Refreshed server value' },
    });
    expect(result.current.getValues('name')).toBe('Unsaved draft');

    rerender({ id: '2', record: { id: 2, name: 'Second record' } });
    await waitFor(() =>
      expect(result.current.getValues('name')).toBe('Second record'),
    );
  });
});
