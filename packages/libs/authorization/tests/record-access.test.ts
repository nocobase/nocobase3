import { expect, it, vi } from 'vitest';
import { createAuthorization, defineRecordAccess } from '../src/core/index.js';

it('registers a builder without running its resolver', async () => {
  const resolve = vi.fn(({ params }: { params: { prefix: string } }) => ({
    prefix: params.prefix,
  }));
  const teamFiles = defineRecordAccess('files.team', (access) =>
    access
      .title('Team files')
      .collections('attachments')
      .params<{ prefix: string }>({ type: 'object' })
      .resolver(resolve),
  );
  const authz = createAuthorization({ plugins: [] });
  const reference = authz.recordAccess.define(teamFiles);
  expect(reference).toEqual({
    key: 'files.team',
    collections: ['attachments'],
  });
  expect(teamFiles.reference()).toEqual(reference);
  expect(resolve).not.toHaveBeenCalled();
  const context = {
    principal: { type: 'user', id: 'alice' },
    collection: 'attachments',
    action: 'read',
    params: { prefix: 'team/' },
  };
  expect(await authz.recordAccess.resolve(reference.key, context)).toEqual({
    prefix: 'team/',
  });
  await expect(
    authz.recordAccess.resolve(reference.key, {
      ...context,
      collection: 'orders',
    }),
  ).rejects.toThrow('inapplicable');
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(() => authz.recordAccess.define(teamFiles)).toThrow('already defined');
});

it('registers the object form and isolates stored metadata', () => {
  const collections = ['*'];
  const authz = createAuthorization({
    plugins: [
      {
        id: 'files',
        setup(context) {
          context.recordAccess.define({
            key: 'all',
            title: { key: 'recordAccess.all', ns: 'app' },
            collections,
            resolve: () => true,
          });
        },
      },
    ],
  });
  collections[0] = 'changed';
  expect(authz.recordAccess.listFor('orders')).toHaveLength(1);
  const stored = authz.recordAccess.get('all')!;
  Reflect.set(stored.collections, 0, 'changed');
  expect(authz.recordAccess.listFor('quotes')).toHaveLength(1);
  expect(authz.recordAccess.list().map((entry) => entry.key)).toEqual(['all']);
});

it('requires collections and a resolver', () => {
  const authz = createAuthorization({ plugins: [] });
  expect(() =>
    authz.recordAccess.define(
      defineRecordAccess('invalid', (access) => access.resolver(() => true)),
    ),
  ).toThrow('requires collections');
  expect(() =>
    authz.recordAccess.define(
      defineRecordAccess('invalid', (access) => access.collections('*')),
    ),
  ).toThrow('requires a resolver');
});
