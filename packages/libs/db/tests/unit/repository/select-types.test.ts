import type {
  DeleteOneResult,
  Repository,
  SelectAst,
  SingleMutationResult,
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

it('infers scalar builder selections and preserves fallback result types', () => {
  expectTypeOf<ReturnType<typeof _findSelectedUsers>>().toEqualTypeOf<
    Promise<Array<Pick<UserRecord, 'id' | 'name'>>>
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
  expectTypeOf<ReturnType<typeof _findUsersWithAst>>().toEqualTypeOf<
    Promise<UserRecord[]>
  >();
  expectTypeOf<ReturnType<typeof _findAllUserFields>>().toEqualTypeOf<
    Promise<UserRecord[]>
  >();
  expectTypeOf<
    ReturnType<typeof _findUsersWithMultipleFieldCalls>
  >().toEqualTypeOf<Promise<Array<Pick<UserRecord, 'id' | 'email'>>>>();
  expectTypeOf<ReturnType<typeof _findUsersWithInclude>>().toEqualTypeOf<
    Promise<UserRecord[]>
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
});
