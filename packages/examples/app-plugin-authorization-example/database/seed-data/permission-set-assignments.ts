import { timestamps, type SalesSeedContext } from './context.js';
export function permissionSetAssignmentRows(context: SalesSeedContext) {
  const { users } = context;
  return [
    {
      id: 'example-role:assistant',
      subjectType: 'user',
      subjectId: users.assistant,
      permissionSetKey: 'example-sales-assistant',
    },
    {
      id: 'example-role:engineer',
      subjectType: 'user',
      subjectId: users.engineer,
      permissionSetKey: 'example-sales-engineer',
    },
    {
      id: 'example-role:manager',
      subjectType: 'user',
      subjectId: users.manager,
      permissionSetKey: 'example-sales-manager',
    },
    {
      id: 'example-role:delivery',
      subjectType: 'user',
      subjectId: users.delivery,
      permissionSetKey: 'example-sales-delivery',
    },
    {
      id: 'example-coordinator-role',
      subjectType: 'user',
      subjectId: users.coordinator,
      permissionSetKey: 'example-sales-manager',
    },
    {
      id: 'example-team:proposal',
      subjectType: 'example.sales.team',
      subjectId: 'proposal',
      permissionSetKey: 'example-sales-engineer',
    },
    {
      id: 'example-team:delivery',
      subjectType: 'example.sales.team',
      subjectId: 'delivery',
      permissionSetKey: 'example-sales-delivery',
    },
  ].map((row) => ({ ...row, ...timestamps(context) }));
}
