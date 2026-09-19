import { describe, expect, it } from 'vitest';
import { buildRepositoryPolicy } from '../../../../src/repository/policy/build.js';
import { normalizeRepositoryPolicy } from '../../../../src/repository/policy/normalize.js';
import { ref } from '../../../../src/repository/policy/refs.js';
import type { RepositoryPolicy } from '../../../../src/repository/policy/types.js';

describe('buildRepositoryPolicy', () => {
  it('denies every node the callback does not mention', () => {
    expect(buildRepositoryPolicy((policy) => policy)).toEqual({
      read: false,
      create: false,
      update: false,
      delete: false,
    });
  });

  it('produces the same Policy as the equivalent object literal', () => {
    const built = buildRepositoryPolicy((policy) =>
      policy
        .read((read) =>
          read
            .scope({ tenantId: 'acme' })
            .fields('id', 'status')
            .relation('items', (items) => items.scope(true).fields('id')),
        )
        .create((create) =>
          create
            .scope({ tenantId: 'acme' })
            .fields('status')
            .defaults({ tenantId: 'acme' })
            .relation('items', (items) =>
              items.scope(true).create((item) => item.fields('title')),
            ),
        )
        .update((update) =>
          update
            .scope(true)
            .fields('status')
            .relation('items', (items) =>
              items
                .update((item) => item.fields('title'))
                .connect((edge) =>
                  edge.through((through) => through.fields('role')),
                )
                .disconnect()
                .delete(),
            ),
        )
        .delete((remove) => remove.scope({ tenantId: 'acme' })),
    );

    const written: RepositoryPolicy = {
      read: {
        scope: { tenantId: 'acme' },
        fields: ['id', 'status'],
        relations: { items: { scope: true, fields: ['id'] } },
      },
      create: {
        scope: { tenantId: 'acme' },
        fields: ['status'],
        defaults: { tenantId: 'acme' },
        relations: { items: { scope: true, create: { fields: ['title'] } } },
      },
      update: {
        scope: true,
        fields: ['status'],
        relations: {
          items: {
            update: { fields: ['title'] },
            connect: { through: { fields: ['role'] } },
            disconnect: {},
            delete: {},
          },
        },
      },
      delete: { scope: { tenantId: 'acme' } },
    };
    expect(built).toEqual(normalizeRepositoryPolicy(written));
  });

  it('accepts booleans and a relation reference', () => {
    expect(
      buildRepositoryPolicy((policy) =>
        policy
          .read((read) =>
            read
              .scope(true)
              .fields('id')
              .relation('customer', ref('customers')),
          )
          .update(true),
      ),
    ).toEqual({
      read: {
        scope: true,
        fields: ['id'],
        relations: { customer: { kind: 'policyRef', target: 'customers' } },
      },
      create: false,
      update: true,
      delete: false,
    });
  });

  it('freezes the result so a later edit cannot widen it', () => {
    const policy = buildRepositoryPolicy((policy) =>
      policy.read((read) => read.scope(true).fields('id')),
    );
    expect(Object.isFrozen(policy)).toBe(true);
    expect(() => {
      (policy.read as unknown as { fields: string[] }).fields.push('secret');
    }).toThrow();
  });

  it('refuses a declared node that omits its scope', () => {
    expect(() =>
      buildRepositoryPolicy((policy) =>
        policy.read((read) => read.fields('id')),
      ),
    ).toThrowError(/scope is required/);
  });

  it('refuses a member or a node declared twice', () => {
    expect(() =>
      buildRepositoryPolicy((policy) =>
        policy.read((read) => read.scope(true).scope(false as never)),
      ),
    ).toThrowError(/scope may only be declared once/);
    expect(() =>
      buildRepositoryPolicy((policy) => policy.update(true).update(false)),
    ).toThrowError(/update may only be declared once/);
    expect(() =>
      buildRepositoryPolicy((policy) =>
        policy.read((read) =>
          read
            .scope(true)
            .relation('items', (items) => items.scope(true))
            .relation('items', (items) => items.scope(true)),
        ),
      ),
    ).toThrowError(/Relation may only be declared once/);
  });

  it('refuses a callback that does not return its own builder', () => {
    expect(() =>
      buildRepositoryPolicy((policy) => {
        policy.read(true);
        return undefined as never;
      }),
    ).toThrowError(/must synchronously return its own builder/);
  });
});

describe('create relation operations', () => {
  it('refuses an operation a root create can never perform', () => {
    for (const operation of [
      'update',
      'upsert',
      'disconnect',
      'set',
      'delete',
    ] as const) {
      expect(() =>
        normalizeRepositoryPolicy({
          read: true,
          create: {
            scope: true,
            relations: { items: { [operation]: {} } },
          } as never,
          update: true,
          delete: true,
        }),
      ).toThrowError(new RegExp(`Unsupported Policy option: ${operation}`));
    }
  });

  it('refuses it anywhere in the create tree, not only at the top', () => {
    expect(() =>
      normalizeRepositoryPolicy({
        read: true,
        create: {
          scope: true,
          relations: {
            items: { create: { relations: { tags: { delete: {} } } } },
          },
        } as never,
        update: true,
        delete: true,
      }),
    ).toThrowError(/Unsupported Policy option: delete/);
  });

  it('leaves an update tree alone, including a create branch inside it', () => {
    expect(() =>
      normalizeRepositoryPolicy({
        read: true,
        create: true,
        update: {
          scope: true,
          relations: {
            items: {
              create: { relations: { tags: { delete: {} } } },
              delete: {},
            },
          },
        },
        delete: true,
      }),
    ).not.toThrow();
  });
});
