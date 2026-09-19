import { expect, it } from 'vitest';
import { DefaultRelationFieldMutationBuilder } from '../../../../src/repository/relation-mutation-builder.js';

it('collects all seven relation operations without mixing selectors and payload', () => {
  const builder = new DefaultRelationFieldMutationBuilder();
  expect(
    builder.create(
      { title: 'New' },
      { clientKey: 'local', through: { role: 'owner' } },
    ),
  ).toBe(builder);
  builder
    .connect({ code: 'existing' }, { through: { role: 'reader' } })
    .disconnect({ code: 'old' })
    .set([{ code: 'replacement' }])
    .update({ filter: { code: 'a' }, values: { title: 'Updated' } })
    .upsert({
      filter: { code: 'b' },
      create: { code: 'b' },
      update: { title: 'Existing' },
    })
    .delete({ filter: { code: 'c' } });
  expect(builder.toState()).toEqual({
    create: [
      {
        kind: 'create',
        values: { title: 'New' },
        clientKey: 'local',
        through: { role: 'owner' },
      },
    ],
    connect: [{ where: { code: 'existing' }, through: { role: 'reader' } }],
    disconnect: [{ code: 'old' }],
    set: [{ code: 'replacement' }],
    update: [{ filter: { code: 'a' }, values: { title: 'Updated' } }],
    upsert: [
      {
        filter: { code: 'b' },
        create: { code: 'b' },
        update: { title: 'Existing' },
      },
    ],
    delete: [{ filter: { code: 'c' } }],
  });
});

it('distinguishes an omitted operation from clear/empty replacement and copies operation lists', () => {
  const builder = new DefaultRelationFieldMutationBuilder();
  expect(builder.toState()).toMatchObject({
    disconnect: undefined,
    set: undefined,
  });
  const snapshot = builder.connect({ code: 'a' }).toState();
  builder.connect({ code: 'b' });
  expect(snapshot.connect).toEqual([{ code: 'a' }]);
  const replacement = [{ code: 'c' }];
  builder.set(replacement);
  replacement.push({ code: 'd' });
  expect(builder.toState().set).toEqual([{ code: 'c' }]);
  builder.set([]).disconnect();
  expect(builder.toState()).toMatchObject({ set: [], disconnect: true });
  expect(new DefaultRelationFieldMutationBuilder().toState().connect).toEqual(
    [],
  );
});
