import { expect, it, vi } from 'vitest';
import { createAuthorization, defineRecordAccess } from '../src/core/index.js';

it('registers and resolves non-database policies without executing during declaration', async () => {
  const resolve = vi.fn(({ params }: { params: { prefix: string } }) => ({
    prefix: params.prefix,
  }));
  const policy = defineRecordAccess('files.team', (access) =>
    access
      .title('Team files')
      .resources({ type: 'file', id: 'attachments' })
      .params<{ prefix: string }>({ type: 'object' })
      .resolve(resolve),
  );
  const authz = createAuthorization({ plugins: [] });
  authz.recordAccess.add(policy);
  expect(resolve).not.toHaveBeenCalled();
  const context = {
    principal: { type: 'user', id: 'alice' },
    resource: { type: 'file', id: 'attachments' },
    action: 'read',
    params: { prefix: 'team/' },
  };
  expect(await authz.recordAccess.resolve(policy.key, context)).toEqual({
    prefix: 'team/',
  });
  await expect(
    authz.recordAccess.resolve(policy.key, {
      ...context,
      resource: { type: 'database.collection', id: 'attachments' },
    }),
  ).rejects.toThrow('inapplicable');
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(() => authz.recordAccess.add(policy)).toThrow('Duplicate');
});

it('isolates declarations and snapshots and exposes the registry to plugins', () => {
  const resource = { type: 'file', id: '*' };
  const policy = defineRecordAccess('files.all', (access) =>
    access.resources(resource).resolve(() => true),
  );
  resource.type = 'changed';
  const authz = createAuthorization({
    plugins: [
      {
        id: 'files',
        setup(context) {
          context.recordAccess.add(policy);
        },
      },
    ],
  });
  expect(authz.recordAccess.listFor({ type: 'file', id: 'one' })).toHaveLength(
    1,
  );
  Reflect.set(
    authz.recordAccess.get(policy.key)!.resources[0],
    'type',
    'changed',
  );
  expect(authz.recordAccess.listFor({ type: 'file', id: 'two' })).toHaveLength(
    1,
  );
  expect(() =>
    defineRecordAccess('invalid', (access) => access.resolve(() => true)),
  ).toThrow('requires resources');
});
