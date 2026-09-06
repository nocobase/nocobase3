export interface RemoteFilterAst {
  readonly kind: 'filter';
  readonly version: 1;
  readonly collection?: string;
  readonly root: Readonly<Record<string, unknown>>;
}

export interface RemoteSelectAst {
  readonly kind: 'select';
  readonly version: 1;
  readonly collection?: string;
  readonly root: Readonly<Record<string, unknown>>;
}

export interface RemoteSortAst {
  readonly kind: 'sort';
  readonly version: 1;
  readonly collection?: string;
  readonly items: readonly Readonly<Record<string, unknown>>[];
}

export type RemoteRepositoryFilter<TRecord extends object> =
  Readonly<Partial<TRecord>> | RemoteFilterAst;

export interface RemoteRepositoryReadOptions<_TRecord extends object> {
  readonly select?: RemoteSelectAst;
}

export interface RemoteFindManyOptions<
  TRecord extends object,
> extends RemoteRepositoryReadOptions<TRecord> {
  readonly filter?: RemoteRepositoryFilter<TRecord>;
  readonly sort?: RemoteSortAst;
  readonly distinct?: readonly [
    keyof TRecord & string,
    ...(keyof TRecord & string)[],
  ];
  readonly limit?: number;
  readonly offset?: number;
  readonly cursor?: Readonly<Partial<TRecord>>;
  readonly direction?: 'forward' | 'backward';
}

export interface RemoteFindOneOptions<
  TRecord extends object,
> extends RemoteRepositoryReadOptions<TRecord> {
  readonly filter: RemoteRepositoryFilter<TRecord>;
  readonly sort?: RemoteSortAst;
}

export interface RemoteFilterOnlyOptions<TRecord extends object> {
  readonly filter?: RemoteRepositoryFilter<TRecord>;
}

export interface RemoteCreateOneOptions<
  TCreate extends object,
  TRecord extends object,
> extends RemoteRepositoryReadOptions<TRecord> {
  readonly values: TCreate;
  readonly idempotencyKey?: string;
}

export interface RemoteUpdateOneOptions<
  TRecord extends object,
  TUpdate extends object,
> extends RemoteRepositoryReadOptions<TRecord> {
  readonly filter: RemoteRepositoryFilter<TRecord>;
  readonly values: TUpdate;
  readonly ifVersion?: string | number;
  readonly idempotencyKey?: string;
}

export interface RemoteDeleteOneOptions<
  TRecord extends object,
> extends RemoteRepositoryReadOptions<TRecord> {
  readonly filter: RemoteRepositoryFilter<TRecord>;
  readonly ifVersion?: string | number;
  readonly idempotencyKey?: string;
}

export interface RemoteMutationResult<TRecord extends object> {
  readonly record: TRecord;
  readonly createdTargets: readonly RemoteCreatedTargetReference[];
  readonly version?: string | number;
}

export interface RemoteCreatedTargetReference {
  readonly clientKey: string;
  readonly collection: string;
  readonly unique: {
    readonly kind: 'unique';
    readonly fields: readonly string[];
    readonly values: Readonly<Record<string, unknown>>;
  };
}

export interface RemoteDeleteResult<TRecord extends object> {
  readonly deleted: true;
  readonly record?: TRecord;
}

export interface RemoteRepository<
  TRecord extends object,
  TCreate extends object = Partial<TRecord>,
  TUpdate extends object = Partial<TRecord>,
> {
  findMany(options?: RemoteFindManyOptions<TRecord>): Promise<TRecord[]>;
  findOne(options: RemoteFindOneOptions<TRecord>): Promise<TRecord | undefined>;
  count(options?: RemoteFilterOnlyOptions<TRecord>): Promise<number>;
  exists(options?: RemoteFilterOnlyOptions<TRecord>): Promise<boolean>;
  createOne(
    options: RemoteCreateOneOptions<TCreate, TRecord>,
  ): Promise<RemoteMutationResult<TRecord>>;
  updateOne(
    options: RemoteUpdateOneOptions<TRecord, TUpdate>,
  ): Promise<RemoteMutationResult<TRecord>>;
  deleteOne(
    options: RemoteDeleteOneOptions<TRecord>,
  ): Promise<RemoteDeleteResult<TRecord>>;
}

export type RemoteRepositoryAction =
  | 'findMany'
  | 'findOne'
  | 'count'
  | 'exists'
  | 'createOne'
  | 'updateOne'
  | 'deleteOne';

export interface RepositoryApiResponse<TResult> {
  readonly data: TResult;
}

export interface RepositoryRequest {
  <TResult, TJson = unknown>(
    options: import('./types.js').ApiRequestOptions<TJson>,
  ): Promise<TResult>;
}

export interface CreateRemoteRepositoryOptions {
  readonly name: string;
  readonly request: RepositoryRequest;
}

export function createRemoteRepository<
  TRecord extends object,
  TCreate extends object = Partial<TRecord>,
  TUpdate extends object = Partial<TRecord>,
>(
  options: CreateRemoteRepositoryOptions,
): RemoteRepository<TRecord, TCreate, TUpdate> {
  const call = <TResult, TJson>(
    action: RemoteRepositoryAction,
    json: TJson,
  ): Promise<TResult> =>
    options
      .request<RepositoryApiResponse<TResult>, TJson>({
        path: `/${encodeURIComponent(options.name)}:${action}`,
        method: 'POST',
        json,
      })
      .then((response): TResult => response.data);

  return {
    findMany: (
      input: RemoteFindManyOptions<TRecord> = {},
    ): Promise<TRecord[]> => call('findMany', input),
    findOne: async (
      input: RemoteFindOneOptions<TRecord>,
    ): Promise<TRecord | undefined> =>
      (await call<TRecord | null, RemoteFindOneOptions<TRecord>>(
        'findOne',
        input,
      )) ?? undefined,
    count: (input: RemoteFilterOnlyOptions<TRecord> = {}): Promise<number> =>
      call('count', input),
    exists: (input: RemoteFilterOnlyOptions<TRecord> = {}): Promise<boolean> =>
      call('exists', input),
    createOne: (
      input: RemoteCreateOneOptions<TCreate, TRecord>,
    ): Promise<RemoteMutationResult<TRecord>> => call('createOne', input),
    updateOne: (
      input: RemoteUpdateOneOptions<TRecord, TUpdate>,
    ): Promise<RemoteMutationResult<TRecord>> => call('updateOne', input),
    deleteOne: (
      input: RemoteDeleteOneOptions<TRecord>,
    ): Promise<RemoteDeleteResult<TRecord>> => call('deleteOne', input),
  };
}
