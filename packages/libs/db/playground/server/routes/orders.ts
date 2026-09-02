import { Hono } from 'hono';
import { PlaygroundHttpError } from '../errors.js';
import {
  idInput,
  objectInput,
  positiveIntegerInput,
  stringInput,
} from '../input.js';
import { OrderService, type CreateOrderItemInput } from '../services/orders.js';

export function createOrderRoutes(service: OrderService): Hono {
  const routes = new Hono();

  routes.get('/', async (context) =>
    context.json({ data: await service.list() }),
  );
  routes.get('/:id', async (context) =>
    context.json({ data: await service.get(idInput(context.req.param('id'))) }),
  );

  routes.post('/', async (context) => {
    const input = objectInput(await context.req.json());
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new PlaygroundHttpError(
        400,
        'INVALID_INPUT',
        '"items" must contain at least one order item.',
      );
    }
    const items: CreateOrderItemInput[] = input.items.map((item) => {
      const itemInput = objectInput(item);
      return {
        productId: positiveIntegerInput(itemInput, 'productId'),
        quantity: positiveIntegerInput(itemInput, 'quantity'),
      };
    });
    const order = await service.create({
      orderNo: stringInput(input, 'orderNo'),
      customerId: positiveIntegerInput(input, 'customerId'),
      items,
    });
    return context.json({ data: order }, 201);
  });

  routes.patch('/:id/status', async (context) => {
    const input = objectInput(await context.req.json());
    const status = stringInput(input, 'status');
    if (!isOrderStatus(status)) {
      throw new PlaygroundHttpError(
        400,
        'INVALID_ORDER_STATUS',
        'Order status must be draft, paid, or cancelled.',
      );
    }
    return context.json({
      data: await service.updateStatus(
        idInput(context.req.param('id')),
        status,
      ),
    });
  });

  routes.delete('/:id', async (context) => {
    await service.delete(idInput(context.req.param('id')));
    return context.body(null, 204);
  });

  return routes;
}

function isOrderStatus(
  status: string,
): status is 'draft' | 'paid' | 'cancelled' {
  return status === 'draft' || status === 'paid' || status === 'cancelled';
}
