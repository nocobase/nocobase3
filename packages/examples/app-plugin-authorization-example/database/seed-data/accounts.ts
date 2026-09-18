import { randomUUID } from 'node:crypto';
import { timestamps, type SalesSeedContext } from './context.js';
export function accountRows(context: SalesSeedContext) {
  return Object.values(context.users).map((userId) => ({
    id: randomUUID(),
    issuer: 'local:credential',
    accountId: userId,
    providerId: 'credential',
    userId,
    password: context.password,
    ...timestamps(context),
  }));
}
