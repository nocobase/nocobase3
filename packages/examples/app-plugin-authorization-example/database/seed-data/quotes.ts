import type { Project } from './projects.js';
export type Quote = {
  id: string;
  title: string;
  projectId: string;
  preparedById: string;
  preparedByName: string;
  notes: string;
  amount: number;
  status: string;
};

export function quoteRows(
  users: Record<string, string>,
  projects: readonly Project[],
): Quote[] {
  const quotes: Quote[] = [];
  for (const row of projects) {
    const quote: Quote = {
      id: row.id.replace('project', 'quote'),
      projectId: row.id,
      preparedById: row.ownerId,
      preparedByName:
        row.id === 'project-8'
          ? 'Jordan Kim'
          : row.id === 'project-1'
            ? 'Alex Chen'
            : row.id === 'project-3'
              ? 'Robin Lin'
              : 'Morgan Lee',
      title: `${row.title} quote`,
      notes: 'Draft',
      amount: 12000,
      status: 'draft',
    };
    quotes.push(quote, {
      ...quote,
      id: row.id.replace('project', 'quote-history'),
      title: `${row.title} confirmed quote`,
      status: 'accepted',
      notes: 'Confirmed source of the existing order',
    });
  }
  quotes.push(
    {
      id: 'quote-5',
      projectId: 'project-2',
      preparedById: users.assistant,
      preparedByName: 'Alex Chen',
      title: 'Garden alternative quote',
      notes: 'Prepared by a colleague',
      amount: 15000,
      status: 'draft',
    },
    {
      id: 'quote-6',
      projectId: 'project-3',
      preparedById: users.engineer,
      preparedByName: 'Morgan Lee',
      title: 'Hill expansion quote',
      notes: 'Prepared for another region',
      amount: 18000,
      status: 'draft',
    },
  );

  quotes.push({
    id: 'quote-7',
    projectId: 'project-3',
    preparedById: users.manager,
    preparedByName: 'Robin Lin',
    title: 'Hill team handover quote',
    notes: 'Cross-region handover to the proposal team',
    amount: 21000,
    status: 'draft',
  });
  return quotes;
}
