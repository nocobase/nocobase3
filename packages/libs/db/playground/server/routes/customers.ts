import { Hono } from 'hono';
import type { DatabaseConnection } from '@nocobase/db';
import { PlaygroundHttpError } from '../errors.js';
import {
  idInput,
  objectInput,
  optionalStringInput,
  stringInput,
} from '../input.js';

export function createCustomerRoutes(crm: DatabaseConnection): Hono {
  const routes = new Hono();

  routes.get('/', async (context) => {
    const rows = await crm.query
      .selectFrom('customers')
      .selectAll()
      .orderBy('name')
      .execute();
    return context.json({ data: rows });
  });

  routes.get('/:id', async (context) => {
    const id = idInput(context.req.param('id'));
    const customer = await crm.query
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!customer) throw customerNotFound();
    const contacts = await crm.query
      .selectFrom('contacts')
      .selectAll()
      .where('customerId', '=', id)
      .orderBy('name')
      .execute();
    return context.json({ data: { ...customer, contacts } });
  });

  routes.post('/', async (context) => {
    const input = objectInput(await context.req.json());
    const result = await crm.query
      .insertInto('customers')
      .values({
        name: stringInput(input, 'name'),
        email: stringInput(input, 'email'),
        company: stringInput(input, 'company'),
        status: optionalStringInput(input, 'status') ?? 'active',
        createdAt: new Date().toISOString(),
      })
      .execute();
    const customer = await crm.query
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', Number(result.insertId))
      .executeTakeFirstOrThrow();
    return context.json({ data: customer }, 201);
  });

  routes.patch('/:id', async (context) => {
    const id = idInput(context.req.param('id'));
    const input = objectInput(await context.req.json());
    const changes = compact({
      name: optionalStringInput(input, 'name'),
      email: optionalStringInput(input, 'email'),
      company: optionalStringInput(input, 'company'),
      status: optionalStringInput(input, 'status'),
    });
    if (Object.keys(changes).length === 0) {
      throw new PlaygroundHttpError(
        400,
        'EMPTY_UPDATE',
        'At least one customer field is required.',
      );
    }
    const result = await crm.query
      .updateTable('customers')
      .set(changes)
      .where('id', '=', id)
      .execute();
    if (result.updatedCount === 0) throw customerNotFound();
    const customer = await crm.query
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return context.json({ data: customer });
  });

  routes.delete('/:id', async (context) => {
    const result = await crm.query
      .deleteFrom('customers')
      .where('id', '=', idInput(context.req.param('id')))
      .execute();
    if (result.deletedCount === 0) throw customerNotFound();
    return context.body(null, 204);
  });

  return routes;
}

function customerNotFound(): PlaygroundHttpError {
  return new PlaygroundHttpError(
    404,
    'CUSTOMER_NOT_FOUND',
    'CRM customer not found.',
  );
}

function compact(
  input: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
}
