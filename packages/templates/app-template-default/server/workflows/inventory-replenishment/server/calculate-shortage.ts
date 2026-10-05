import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface CalculateShortageArgs {
  stockLevel?: unknown;
  reorderPoint?: unknown;
  targetMultiplier?: unknown;
}

export const run: WorkflowRunFunction = (
  rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as CalculateShortageArgs;
  if (typeof args.stockLevel !== 'number' || !Number.isInteger(args.stockLevel))
    throw new Error('stockLevel must be an integer.');
  if (
    typeof args.reorderPoint !== 'number' ||
    !Number.isInteger(args.reorderPoint)
  )
    throw new Error('reorderPoint must be an integer.');
  if (
    typeof args.targetMultiplier !== 'number' ||
    !Number.isFinite(args.targetMultiplier)
  )
    throw new Error('targetMultiplier must be a finite number.');

  const reorderRequired = args.stockLevel <= args.reorderPoint;
  const targetStock = Math.ceil(args.reorderPoint * args.targetMultiplier);
  const recommendedQuantity = reorderRequired
    ? Math.max(0, targetStock - args.stockLevel)
    : 0;

  runtime.logger.info('Inventory shortage calculated');
  return { reorderRequired, recommendedQuantity };
};
