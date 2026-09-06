import type { ApiClient, RemoteRepository } from '@nocobase/app-client';
import type { RemoteFilterAst } from '@nocobase/api-client';

export const ATOMIC_REPOSITORY = 'repositoryExampleAtomicCounters';
export interface AtomicCounter {
  readonly id: string;
  readonly name: string;
  readonly value: number;
}
export type AtomicChange =
  { increment: number } | { decrement: number } | { multiply: number };
export interface AtomicValues {
  readonly value: AtomicChange;
}
export function atomicRepository(
  api: ApiClient,
): RemoteRepository<AtomicCounter, never, AtomicValues> {
  return api.repository<AtomicCounter, never, AtomicValues>(ATOMIC_REPOSITORY);
}
export function atomicUpdate(
  id: string,
  change: AtomicChange,
): { filter: RemoteFilterAst; values: AtomicValues } {
  return {
    filter: {
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          { kind: 'condition', path: ['id'], operator: '$eq', value: id },
          ...('decrement' in change
            ? [
                {
                  kind: 'condition',
                  path: ['value'],
                  operator: '$gte',
                  value: change.decrement,
                },
              ]
            : []),
        ],
      },
    },
    values: { value: change },
  };
}
