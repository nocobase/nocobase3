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
import type { RepositoryPolicy } from '../../../../src/repository/policy/types.js';

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

// A policy held in a variable of the declared type, which is what an
// application does when it builds policies in one place. `read` is then
// `true | false | ReadNode`, a union that is not itself an object; testing it
// directly handed back the complete record for exactly the policies most
// likely to restrict it.
declare const stored: RepositoryPolicy<Order>;
const viaVariable = orders.withPolicy(stored);

export const conservative: RepositoryQuery<Partial<Order>> =
  viaVariable.findMany({});

// @ts-expect-error a policy that may restrict reads must not promise them all
export const unsound: RepositoryQuery<Order> = viaVariable.findMany({});
