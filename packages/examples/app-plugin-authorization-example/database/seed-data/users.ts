import { timestamps, type SalesSeedContext } from './context.js';
export const userProfiles = {
  assistant: { name: 'Alex Chen', region: 'North' },
  engineer: { name: 'Morgan Lee', region: 'North' },
  manager: { name: 'Robin Lin', region: 'South' },
  delivery: { name: 'Casey Wu', region: 'North' },
  proposal: { name: 'Jamie Park', region: 'North' },
  dispatch: { name: 'Taylor Reed', region: 'North' },
  coordinator: { name: 'Jordan Kim', region: 'North' },
} as const;
export type UserKey = keyof typeof userProfiles;
export function userRows(context: SalesSeedContext) {
  return Object.entries(userProfiles).map(([key, profile]) => ({
    id: context.users[key as UserKey],
    username: `sales_${key}`,
    name: profile.name,
    email: `sales_${key}@example.test`,
    emailVerified: true,
    ...timestamps(context),
  }));
}
