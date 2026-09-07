import { Hono } from 'hono';
import type { DatabaseConnection } from '@nocobase/db';
import { PlaygroundHttpError } from '../errors.js';
import {
  idInput,
  objectInput,
  optionalStringInput,
  positiveIntegerInput,
  stringInput,
} from '../input.js';

export function createContactRoutes(crm: DatabaseConnection): Hono {
  const routes = new Hono();

  routes.get('/', async (context) => {
    const rows = await crm.query
      .selectFrom('contacts as contact')
      .innerJoin('customers as customer', 'contact.customerId', 'customer.id')
      .select([
        'contact.id as id',
        'contact.customerId as customerId',
        'customer.name as customerName',
        'contact.name as name',
        'contact.email as email',
        'contact.role as role',
        'contact.createdAt as createdAt',
      ])
      .orderBy('contact.name')
      .execute();
    return context.json({ data: rows });
  });

  routes.get('/:id', async (context) => {
    const contact = await crm.query
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', idInput(context.req.param('id')))
      .executeTakeFirst();
    if (!contact) throw contactNotFound();
    return context.json({ data: contact });
  });

  routes.post('/', async (context) => {
    const input = objectInput(await context.req.json());
    const customerId = positiveIntegerInput(input, 'customerId');
    await requireCustomer(crm, customerId);
    const result = await crm.query
      .insertInto('contacts')
      .values({
        customerId,
        name: stringInput(input, 'name'),
        email: stringInput(input, 'email'),
        role: stringInput(input, 'role'),
        createdAt: new Date().toISOString(),
      })
      .execute();
    const contact = await crm.query
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', Number(result.insertId))
      .executeTakeFirstOrThrow();
    return context.json({ data: contact }, 201);
  });

  routes.patch('/:id', async (context) => {
    const id = idInput(context.req.param('id'));
    const input = objectInput(await context.req.json());
    const customerId =
      input.customerId === undefined
        ? undefined
        : positiveIntegerInput(input, 'customerId');
    if (customerId !== undefined) await requireCustomer(crm, customerId);
    const changes = Object.fromEntries(
      Object.entries({
        customerId,
        name: optionalStringInput(input, 'name'),
        email: optionalStringInput(input, 'email'),
        role: optionalStringInput(input, 'role'),
      }).filter((entry) => entry[1] !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      throw new PlaygroundHttpError(
        400,
        'EMPTY_UPDATE',
        'At least one contact field is required.',
      );
    }
    const result = await crm.query
      .updateTable('contacts')
      .set(changes)
      .where('id', '=', id)
      .execute();
    if (result.updatedCount === 0) throw contactNotFound();
    const contact = await crm.query
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return context.json({ data: contact });
  });

  routes.delete('/:id', async (context) => {
    const result = await crm.query
      .deleteFrom('contacts')
      .where('id', '=', idInput(context.req.param('id')))
      .execute();
    if (result.deletedCount === 0) throw contactNotFound();
    return context.body(null, 204);
  });

  return routes;
}

async function requireCustomer(
  crm: DatabaseConnection,
  id: number,
): Promise<void> {
  if (
    !(await crm.query
      .selectFrom('customers')
      .select('id')
      .where('id', '=', id)
      .exists())
  ) {
    throw new PlaygroundHttpError(
      404,
      'CUSTOMER_NOT_FOUND',
      'CRM customer not found.',
    );
  }
}

function contactNotFound(): PlaygroundHttpError {
  return new PlaygroundHttpError(
    404,
    'CONTACT_NOT_FOUND',
    'CRM contact not found.',
  );
}
