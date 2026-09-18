export type Project = {
  id: string;
  title: string;
  region: string;
  ownerId: string;
  confidential: boolean;
  notes: string;
};

export function projectRows(users: Record<string, string>): Project[] {
  return [
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
    {
      id: 'project-8',
      title: 'Lakeside renewal project',
      region: 'West',
      ownerId: users.coordinator,
      confidential: false,
    },
  ].map((row) => ({ ...row, notes: 'Fictional demonstration record' }));
}
