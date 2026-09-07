import type {
  ApiClient,
  RemoteFindManyOptions,
  RemoteRepository,
} from '@nocobase/api-client';

export interface FindManyRecord {
  readonly id: string;
  readonly sequence: number;
  readonly title: string;
  readonly category: 'alpha' | 'beta' | 'gamma';
  readonly description: string;
}

export const findManyOptions: RemoteFindManyOptions<FindManyRecord> = {
  limit: 24,
  sort: {
    kind: 'sort',
    version: 1,
    items: [{ kind: 'field', path: ['sequence'], direction: 'asc' }],
  },
};

export function findManyRepository(
  api: ApiClient,
): RemoteRepository<FindManyRecord> {
  return api.repository<FindManyRecord>('repositoryExampleFindManyRecords');
}
