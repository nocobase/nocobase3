import { projectRows } from '../database/seed-data/projects.js';
import { quoteRows } from '../database/seed-data/quotes.js';
import { orderRows } from '../database/seed-data/orders.js';
export type { Project } from '../database/seed-data/projects.js';
export type { Quote } from '../database/seed-data/quotes.js';
export type { Order } from '../database/seed-data/orders.js';

/** One fixture source for installation and the administrator's practice reset. */
export function salesRecords(users: Record<string, string>) {
  const projects = projectRows(users);
  return {
    projects,
    quotes: quoteRows(users, projects),
    orders: orderRows(projects),
  };
}
