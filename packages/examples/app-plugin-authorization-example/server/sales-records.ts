type Project = {
  id: string;
  title: string;
  region: string;
  ownerId: string;
  confidential: boolean;
  notes: string;
};
type Quote = {
  id: string;
  title: string;
  projectId: string;
  preparedById: string;
  preparedByName: string;
  notes: string;
  amount: number;
  status: string;
};
type Order = {
  id: string;
  title: string;
  projectId: string;
  quoteId: string;
  status: string;
  deliveryReference: string;
};
/** Shared initial records for seeding and the administrator's practice reset. */
export function salesRecords(users: Record<string, string>): {
  projects: Project[];
  quotes: Quote[];
  orders: Order[];
} {
  const projects = [
    {
      id: 'project-1',
      title: 'Harbor project',
      region: 'North',
      ownerId: users.assistant,
      confidential: false,
    },
    {
      id: 'project-2',
      title: 'Garden project',
      region: 'North',
      ownerId: users.engineer,
      confidential: false,
    },
    {
      id: 'project-3',
      title: 'Hill project',
      region: 'South',
      ownerId: users.manager,
      confidential: false,
    },
    {
      id: 'project-4',
      title: 'Research project',
      region: 'North',
      ownerId: users.engineer,
      confidential: true,
    },
  ].map((row) => ({ ...row, notes: 'Fictional demonstration record' }));
  const orders = [];
  const quotes = [];
  for (const row of projects) {
    orders.push({
      id: row.id.replace('project', 'order'),
      projectId: row.id,
      quoteId: row.id.replace('project', 'quote-history'),
      title: `${row.title} order`,
      status: 'ready',
      deliveryReference: '',
    });
    const quote: Quote = {
      id: row.id.replace('project', 'quote'),
      projectId: row.id,
      preparedById: row.ownerId,
      preparedByName:
        row.id === 'project-1'
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
  return { projects, quotes, orders };
}
