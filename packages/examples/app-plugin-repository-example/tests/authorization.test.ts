// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { repository } from '../client/model.js';
import { createFixture } from './helpers.js';

describe('Repository example authorization', () => {
  let f: Awaited<ReturnType<typeof createFixture>> | undefined;
  afterEach(async () => {
    await f?.database.destroy();
    f = undefined;
  });

  it('lets a signed-in user the seed grants read the sample data', async () => {
    f = await createFixture();

    await expect(repository(f.api, 'customers').count()).resolves.toBe(0);
  });

  it('refuses a signed-in user no Permission Set reaches', async () => {
    f = await createFixture({ grant: false });

    await expect(
      repository(f.api, 'customers').findMany({ limit: 10 }),
    ).rejects.toMatchObject({ status: 403, code: 'READ_FORBIDDEN' });
  });

  // The grant carries no relation rules, so a relation the exposure's shape
  // declares has to survive the narrowing.
  it('still accepts a relation mutation the exposure declares', async () => {
    f = await createFixture();
    const customers = repository(f.api, 'customers');
    await customers.createOne({
      values: {
        id: 'customer',
        name: 'Ada',
        company: 'Acme',
        email: 'ada@example.test',
        status: 'active',
      },
    });

    const contact = await repository(f.api, 'contacts').createOne({
      values: {
        id: 'contact',
        name: 'Sales',
        email: 'sales@example.test',
        phone: '123',
        customer: { connect: { id: 'customer' } },
      },
    });

    expect(contact).toMatchObject({
      record: { id: 'contact', customerId: 'customer' },
    });
  });
});
