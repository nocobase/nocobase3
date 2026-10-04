import { z } from 'zod';

const text = z.string().max(500);

export const QuoteParams = z.object({ quoteId: z.string().min(1) });
export const OrderParams = z.object({ orderId: z.string().min(1) });

/** The fields a draft quote may change; a client sends only the ones it changes. */
export const UpdateQuoteInput = z
  .strictObject({
    amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    notes: text,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Expected at least one field.',
  });
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteInput>;

/** A blank reference is refused in the handler with its own reason, `DELIVERY_REFERENCE_REQUIRED`. */
export const DeliverOrderInput = z.strictObject({ deliveryReference: text });
export type DeliverOrderInput = z.infer<typeof DeliverOrderInput>;

/**
 * A Repository mutation tree for the order's relations, such as `{ carrier: { connect: { id } } }`. Only its outer
 * shape is checked here: the Repository validates the tree against the bound Policy, which decides what may change.
 */
export const UpdateOrderRelationsInput = z.record(z.string(), z.unknown());
export type UpdateOrderRelationsInput = z.infer<
  typeof UpdateOrderRelationsInput
>;

/** The `values` of a `salesProjects/updateOne` request: only a project's title and notes are editable. */
export const ProjectUpdateInput = z.looseObject({
  values: z
    .strictObject({ title: text, notes: text })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Expected at least one field.',
    }),
});
