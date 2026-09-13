/**
 * Type-level contract for the Policy return type.
 *
 * Kept as a compiled file rather than a runtime test: what is being checked is
 * that binding a read node degrades the record type, which only the compiler
 * can observe.
 */
import type {
  Repository,
  RepositoryQuery,
} from '../../../../src/repository/types.js';

interface Order {
  id: string;
  status: string;
  budget: number;
}

declare const orders: Repository<Order>;

const unrestricted = orders.withPolicy({
  read: true,
  create: true,
  update: true,
  delete: true,
});
const restricted = orders.withPolicy({
  read: { scope: true, fields: ['id', 'status'] },
  create: { scope: true },
  update: { scope: true },
  delete: { scope: true },
});

// `read: true` adds no limits, so the whole record survives.
export const full: RepositoryQuery<Order> = unrestricted.findMany({});

// A read node means an omitted select returns `read.fields` alone.
export const partial: RepositoryQuery<Partial<Order>> = restricted.findMany({});

// @ts-expect-error a policy-shaped read must not pass as the complete record
export const wrong: RepositoryQuery<Order> = restricted.findMany({});
