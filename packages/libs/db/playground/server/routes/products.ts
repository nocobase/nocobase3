import { Hono } from 'hono';
import type { DatabaseConnection } from '@nocobase/db';
import { PlaygroundHttpError } from '../errors.js';
import {
  idInput,
  numberInput,
  objectInput,
  optionalStringInput,
  stringInput,
} from '../input.js';

export function createProductRoutes(main: DatabaseConnection): Hono {
  const routes = new Hono();

  routes.get('/', async (context) => {
    const rows = await main.query
      .selectFrom('products')
      .selectAll()
      .orderBy('name')
      .execute();
    return context.json({ data: rows });
  });

  routes.post('/', async (context) => {
    const input = objectInput(await context.req.json());
    const price = nonNegativeNumber(input, 'price');
    const stock = nonNegativeInteger(input, 'stock');
    const result = await main.query
      .insertInto('products')
      .values({
        name: stringInput(input, 'name'),
        sku: stringInput(input, 'sku'),
        price,
        stock,
        createdAt: new Date().toISOString(),
      })
      .execute();
    return context.json(
      {
        data: await getProduct(main, Number(result.insertId)),
      },
      201,
    );
  });

  routes.patch('/:id', async (context) => {
    const id = idInput(context.req.param('id'));
    const input = objectInput(await context.req.json());
    const changes = Object.fromEntries(
      Object.entries({
        name: optionalStringInput(input, 'name'),
        sku: optionalStringInput(input, 'sku'),
        price:
          input.price === undefined
            ? undefined
            : nonNegativeNumber(input, 'price'),
        stock:
          input.stock === undefined
            ? undefined
            : nonNegativeInteger(input, 'stock'),
      }).filter((entry) => entry[1] !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      throw new PlaygroundHttpError(
        400,
        'EMPTY_UPDATE',
        'At least one product field is required.',
      );
    }
    const result = await main.query
      .updateTable('products')
      .set(changes)
      .where('id', '=', id)
      .execute();
    if (result.updatedCount === 0) throw productNotFound();
    return context.json({ data: await getProduct(main, id) });
  });

  routes.delete('/:id', async (context) => {
    const result = await main.query
      .deleteFrom('products')
      .where('id', '=', idInput(context.req.param('id')))
      .execute();
    if (result.deletedCount === 0) throw productNotFound();
    return context.body(null, 204);
  });

  return routes;
}

async function getProduct(
  main: DatabaseConnection,
  id: number,
): Promise<Record<string, unknown>> {
  const product = await main.query
    .selectFrom('products')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!product) throw productNotFound();
  return product;
}

function productNotFound(): PlaygroundHttpError {
  return new PlaygroundHttpError(
    404,
    'PRODUCT_NOT_FOUND',
    'Product not found.',
  );
}

function nonNegativeNumber(
  input: Record<string, unknown>,
  name: string,
): number {
  const value = numberInput(input, name);
  if (value < 0) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be zero or greater.`,
    );
  }
  return value;
}

function nonNegativeInteger(
  input: Record<string, unknown>,
  name: string,
): number {
  const value = nonNegativeNumber(input, name);
  if (!Number.isInteger(value)) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be an integer.`,
    );
  }
  return value;
}
