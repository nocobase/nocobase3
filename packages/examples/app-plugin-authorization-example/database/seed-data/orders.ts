import type { Project } from './projects.js';
export type Order = {
  id: string;
  title: string;
  projectId: string;
  quoteId: string;
  status: string;
  deliveryReference: string;
};

export function orderRows(projects: readonly Project[]): Order[] {
  return projects.map((row) => ({
    id: row.id.replace('project', 'order'),
    projectId: row.id,
    quoteId: row.id.replace('project', 'quote-history'),
    title: `${row.title} order`,
    status: 'ready',
    deliveryReference: '',
  }));
}
