// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createTask, tasksRepository } from '../client/model.js';
import { createFixture } from './helpers.js';

describe('Authorization example', () => {
  let f: Awaited<ReturnType<typeof createFixture>> | undefined;
  afterEach(async () => {
    await f?.database.destroy();
    f = undefined;
  });

  async function seedTasks(
    fixture: Awaited<ReturnType<typeof createFixture>>,
  ): Promise<void> {
    await createTask(fixture.client('alice'), 'Write the migration');
    await createTask(fixture.client('alice'), 'Write the seed');
    await createTask(fixture.client('bob'), 'Review the example');
  }

  it('shows a signed-in user their own tasks and nobody else’s', async () => {
    f = await createFixture();
    await seedTasks(f);
    const alice = tasksRepository(f.client('alice'));

    await expect(alice.findMany({ limit: 100 })).resolves.toHaveLength(2);
    await expect(alice.count()).resolves.toBe(2);
    await expect(
      tasksRepository(f.client('bob')).findMany({ limit: 100 }),
    ).resolves.toHaveLength(1);
  });

  // 404 rather than 403: the row is outside Bob's scope, which the Repository
  // reports exactly as it reports a row that does not exist. Saying "forbidden"
  // would confirm that someone else's task is there.
  it('answers 404 when a user updates a task they do not own', async () => {
    f = await createFixture();
    await seedTasks(f);
    const [task] = await tasksRepository(f.client('alice')).findMany({
      limit: 1,
    });

    await expect(
      tasksRepository(f.client('bob')).updateOne({
        filter: { id: task!.id },
        values: { status: 'done', updatedAt: new Date().toISOString() },
      }),
    ).rejects.toMatchObject({ status: 404, code: 'RECORD_NOT_FOUND' });
  });

  it('refuses a signed-in user no Permission Set reaches', async () => {
    f = await createFixture({ grant: false });

    await expect(
      tasksRepository(f.client('alice')).findMany({ limit: 100 }),
    ).rejects.toMatchObject({ status: 403, code: 'READ_FORBIDDEN' });
  });

  it('shows a root holder every task, because unrestricted access skips grants', async () => {
    f = await createFixture({ root: 'admin' });
    await seedTasks(f);

    await expect(
      tasksRepository(f.client('admin')).findMany({ limit: 100 }),
    ).resolves.toHaveLength(3);
  });

  describe('the create route', () => {
    it('stamps the owner from the principal', async () => {
      f = await createFixture();
      await createTask(f.client('alice'), 'Stamped');

      await expect(
        tasksRepository(f.client('alice')).findMany({ limit: 1 }),
      ).resolves.toMatchObject([{ title: 'Stamped', ownerId: 'alice' }]);
    });

    it('refuses a body that chooses its own owner', async () => {
      f = await createFixture();

      await expect(
        f.client('alice').request({
          method: 'POST',
          path: '/authorization-example/tasks',
          json: { title: 'Borrowed', ownerId: 'bob' },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
