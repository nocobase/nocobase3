import type { SalesSeedContext } from './context.js';
export function teamMemberRows({ users }: SalesSeedContext) {
  return [
    { teamId: 'proposal', userId: users.proposal },
    { teamId: 'delivery', userId: users.dispatch },
    { teamId: 'proposal', userId: users.coordinator },
  ].map((row) => ({ id: `${row.teamId}:${row.userId}`, ...row }));
}
