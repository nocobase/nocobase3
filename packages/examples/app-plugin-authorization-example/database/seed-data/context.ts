import type { UserKey } from './users.js';
export interface SalesSeedContext {
  users: Record<UserKey, string>;
  now: Date;
  password: string;
}
export const timestamps = ({ now }: SalesSeedContext) => ({
  createdAt: now,
  updatedAt: now,
});
