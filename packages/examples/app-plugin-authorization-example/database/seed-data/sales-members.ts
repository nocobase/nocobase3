import { userProfiles, type UserKey } from './users.js';
import type { SalesSeedContext } from './context.js';
export function salesMemberRows({ users }: SalesSeedContext) {
  return Object.entries(userProfiles).map(([key, profile]) => ({
    id: users[key as UserKey],
    region: profile.region,
  }));
}
