import type {
  CreateManyResult,
  DeleteManyResult,
  DeleteOneResult,
  Repository,
  RepositoryQuery,
  SelectAst,
  SingleMutationResult,
  UpdateManyResult,
} from '../../../src/index.js';
import { expectTypeOf, it } from 'vitest';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
}

interface UserCreate {
  name: string;
  email: string;
  enabled?: boolean;
}

interface UserUpdate {
  name?: string;
  email?: string;
  enabled?: boolean;
}

type UserRepository = Repository<UserRecord, UserCreate, UserUpdate>;

function _findEmptyUsers(repository: UserRepository) {
  return repository.findMany({ select: (s) => s.fields() });
}

function _findDefaultUsers(repository: UserRepository) {
  return repository.findMany({ select: (s) => s });
}

function _findRecordsOnly(repository: UserRepository) {
  return repository.findMany({
    select: (s) =>
      s.fields().include('tasks', (t) =>
        t.combine({
          records: t.fields('title'),
          empty: t.fields(),
        }),
      ),
  });
}

function _findAggregatesOnly(repository: UserRepository) {
  return repository.findMany({
    select: (s) =>
      s
        .fields()
        .include('tasks', (t) =>
          t.combine({ count: t.count(), sum: t.sum('points') }),
        ),
  });
}

function _createEmptyUsers(repository: UserRepository) {
  return repository.createMany({
    values: [{ name: 'A', email: 'a@example.com' }],
    select: (s) => s.fields(),
  });
}

it('infers empty, default, records-only and aggregate-only selections without extra keys', () => {
  expectTypeOf<
    Awaited<ReturnType<typeof _findEmptyUsers>>[number]
  >().toEqualTypeOf<Pick<UserRecord, never>>();
  expectTypeOf<ReturnType<typeof _findDefaultUsers>>().toEqualTypeOf<
    RepositoryQuery<UserRecord>
  >();
  type Records = Awaited<ReturnType<typeof _findRecordsOnly>>[number];
  expectTypeOf<keyof Records>().toEqualTypeOf<'tasks'>();
  expectTypeOf<
    keyof Records['tasks']['records'][number]
  >().toEqualTypeOf<'title'>();
  expectTypeOf<
    keyof Records['tasks']['empty'][number]
  >().toEqualTypeOf<never>();
  type Aggregates = Awaited<ReturnType<typeof _findAggregatesOnly>>[number];
  expectTypeOf<keyof Aggregates>().toEqualTypeOf<'tasks'>();
  expectTypeOf<keyof Aggregates['tasks']>().toEqualTypeOf<'count' | 'sum'>();
  expectTypeOf<Aggregates['tasks']['count']>().toEqualTypeOf<number>();
  expectTypeOf<Aggregates['tasks']['sum']>().toEqualTypeOf<
    number | string | bigint | null
  >();
  expectTypeOf<ReturnType<typeof _createEmptyUsers>>().toEqualTypeOf<
    Promise<CreateManyResult<Pick<UserRecord, never>>>
  >();
});

function _findSelectedUsers(repository: UserRepository) {
  return repository.findMany({
    select: (select) => select.fields('id', 'name'),
  });
}

function _findSelectedUser(repository: UserRepository) {
  return repository.findOne({
    filter: { id: 'user-1' },
    select: (select) => select.fields('id', 'email'),
  });
}

function _createSelectedUser(repository: UserRepository) {
  return repository.createOne({
    context: { viewer: { accountCode: 'A' } },
    values: {
      name: 'Alice',
      email: 'alice@example.com',
    },
    select: (select) => select.fields('id', 'name'),
  });
}

function _updateSelectedUser(repository: UserRepository) {
  return repository.updateOne({
    filter: { id: 'user-1' },
    values: { enabled: true },
    select: (select) => select.fields('id', 'enabled'),
  });
}

function _upsertSelectedUser(repository: UserRepository) {
  return repository.upsertOne({
    filter: { email: 'alice@example.com' },
    create: {
      name: 'Alice',
      email: 'alice@example.com',
    },
    update: { name: 'Alice Updated' },
    select: (select) => select.fields('id', 'name'),
  });
}

function _findUsersWithAst(repository: UserRepository, select: SelectAst) {
  return repository.findMany({ select });
}

function _findAllUserFields(repository: UserRepository) {
  return repository.findMany();
}

function _findUsersWithMultipleFieldCalls(repository: UserRepository) {
  return repository.findMany({
    select: (select) => select.fields('id').fields('email'),
  });
}

function _findUsersWithInclude(repository: UserRepository) {
  return repository.findMany({
    select: (select) => select.fields('id').include('profile'),
  });
}

function _findUsersWithCombine(repository: UserRepository) {
  return repository.findMany({
    select: (s) =>
      s
        .fields('id')
        .include('tasks', (tasks) =>
          tasks.combine({
            count: tasks.count(),
            total: tasks.sum('points'),
            records: tasks.fields('title'),
          }),
        )
        .include('comments', (comments) => comments.count()),
  });
}

it('infers relation aggregate and combine outputs with selected root fields', () => {
  type Row = Awaited<ReturnType<typeof _findUsersWithCombine>>[number];
  expectTypeOf<Row['id']>().toEqualTypeOf<string>();
  expectTypeOf<Row['comments']>().toEqualTypeOf<number>();
  expectTypeOf<Row['tasks']['count']>().toEqualTypeOf<number>();
  expectTypeOf<Row['tasks']['total']>().toEqualTypeOf<
    number | string | bigint | null
  >();
  expectTypeOf<
    keyof Row['tasks']['records'][number]
  >().toEqualTypeOf<'title'>();
  expectTypeOf<keyof Row>().toEqualTypeOf<'id' | 'tasks' | 'comments'>();
});

function _deleteSelectedUser(repository: UserRepository) {
  return repository.deleteOne({
    filter: { id: 'user-1' },
    select: (select) => select.fields('id', 'email'),
  });
}

function _deleteUserWithoutSelect(repository: UserRepository) {
  return repository.deleteOne({ filter: { id: 'user-1' } });
}

function _deleteUserWithAst(repository: UserRepository, select: SelectAst) {
  return repository.deleteOne({
    filter: { id: 'user-1' },
    select,
  });
}

function _createSelectedUsers(repository: UserRepository) {
  return repository.createMany({
    context: { viewer: { accountCode: 'A' } },
    values: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
    ],
    select: (select) => select.fields('id', 'name'),
  });
}

function _updateSelectedUsers(repository: UserRepository) {
  return repository.updateMany({
    filter: { enabled: false },
    values: { enabled: true },
    select: (select) => select.fields('id', 'enabled'),
  });
}

function _deleteSelectedUsers(repository: UserRepository) {
  return repository.deleteMany({
    filter: { enabled: false },
    select: (select) => select.fields('id', 'email'),
  });
}

function _aggregateUsers(repository: UserRepository) {
  return repository.aggregate({
    filter: { enabled: true },
    aggregate: (aggregate) => ({
      count: aggregate.count(),
      enabledCount: aggregate.count('enabled'),
      minimumId: aggregate.min('id'),
      maximumName: aggregate.max('name'),
    }),
  });
}

function _groupUsers(repository: UserRepository) {
  return repository.groupBy({
    by: ['enabled'] as const,
    aggregate: (aggregate) => ({
      count: aggregate.count(),
      maximumName: aggregate.max('name'),
    }),
    having: (filter) => filter.number('count').gt(1),
    sort: (sort) => sort.field('count').desc(),
  });
}

function _streamSelectedUsers(repository: UserRepository) {
  return repository.findMany({
    select: (select) => select.fields('id', 'name'),
  });
}

it('infers scalar builder selections and preserves fallback result types', () => {
  expectTypeOf<ReturnType<typeof _findSelectedUsers>>().toEqualTypeOf<
    RepositoryQuery<Pick<UserRecord, 'id' | 'name'>>
  >();
  expectTypeOf<ReturnType<typeof _findSelectedUser>>().toEqualTypeOf<
    Promise<Pick<UserRecord, 'id' | 'email'> | undefined>
  >();
  expectTypeOf<ReturnType<typeof _createSelectedUser>>().toEqualTypeOf<
    Promise<SingleMutationResult<Pick<UserRecord, 'id' | 'name'>>>
  >();
  expectTypeOf<ReturnType<typeof _updateSelectedUser>>().toEqualTypeOf<
    Promise<SingleMutationResult<Pick<UserRecord, 'id' | 'enabled'>>>
  >();
  expectTypeOf<ReturnType<typeof _upsertSelectedUser>>().toEqualTypeOf<
    Promise<SingleMutationResult<Pick<UserRecord, 'id' | 'name'>>>
  >();
  expectTypeOf<ReturnType<typeof _findUsersWithAst>>().toEqualTypeOf<
    RepositoryQuery<UserRecord>
  >();
  expectTypeOf<ReturnType<typeof _findAllUserFields>>().toEqualTypeOf<
    RepositoryQuery<UserRecord>
  >();
  expectTypeOf<
    ReturnType<typeof _findUsersWithMultipleFieldCalls>
  >().toEqualTypeOf<RepositoryQuery<Pick<UserRecord, 'id' | 'email'>>>();
  expectTypeOf<ReturnType<typeof _findUsersWithInclude>>().toEqualTypeOf<
    RepositoryQuery<UserRecord>
  >();
  expectTypeOf<ReturnType<typeof _deleteSelectedUser>>().toEqualTypeOf<
    Promise<DeleteOneResult<Pick<UserRecord, 'id' | 'email'>>>
  >();
  expectTypeOf<ReturnType<typeof _deleteUserWithoutSelect>>().toEqualTypeOf<
    Promise<DeleteOneResult>
  >();
  expectTypeOf<ReturnType<typeof _deleteUserWithAst>>().toEqualTypeOf<
    Promise<DeleteOneResult<UserRecord>>
  >();
  expectTypeOf<ReturnType<typeof _createSelectedUsers>>().toEqualTypeOf<
    Promise<CreateManyResult<Pick<UserRecord, 'id' | 'name'>>>
  >();
  expectTypeOf<ReturnType<typeof _updateSelectedUsers>>().toEqualTypeOf<
    Promise<UpdateManyResult<Pick<UserRecord, 'id' | 'enabled'>>>
  >();
  expectTypeOf<ReturnType<typeof _deleteSelectedUsers>>().toEqualTypeOf<
    Promise<DeleteManyResult<Pick<UserRecord, 'id' | 'email'>>>
  >();
  expectTypeOf<ReturnType<typeof _aggregateUsers>>().toEqualTypeOf<
    Promise<{
      readonly count: number;
      readonly enabledCount: number;
      readonly minimumId: string | null;
      readonly maximumName: string | null;
    }>
  >();
  expectTypeOf<ReturnType<typeof _groupUsers>>().toEqualTypeOf<
    Promise<
      Array<
        Readonly<Pick<UserRecord, 'enabled'>> & {
          readonly count: number;
          readonly maximumName: string | null;
        }
      >
    >
  >();
  expectTypeOf<ReturnType<typeof _streamSelectedUsers>>().toEqualTypeOf<
    RepositoryQuery<Pick<UserRecord, 'id' | 'name'>>
  >();
});
