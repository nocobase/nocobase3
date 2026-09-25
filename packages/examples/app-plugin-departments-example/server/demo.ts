import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';

import type { OrganizationService } from './tokens.js';

export interface DemoAccount {
  readonly name: string;
  readonly email: string;
  readonly departmentId: string;
}

/** Fictional accounts for practice. They share one password and belong to the seeded tree. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: 'Dana Director',
    email: 'dana@departments.example',
    departmentId: 'hq',
  },
  {
    name: 'Sam Seller',
    email: 'sam@departments.example',
    departmentId: 'sales-east',
  },
  {
    name: 'Sue Support',
    email: 'sue@departments.example',
    departmentId: 'support',
  },
];

export const DEMO_PASSWORD = 'departments-demo';

export interface ProvisionDemoAccountsOptions {
  readonly users: Pick<UserAdministrationService, 'create' | 'list'>;
  readonly organization: Pick<
    OrganizationService,
    'getDepartment' | 'addMember'
  >;
}

/**
 * Creates each demo account that does not exist yet, with its membership.
 *
 * A seed cannot do this: accounts belong to the authentication plugin and are created through its administration
 * service, which a seed's restricted container does not offer. An existing account is left alone, so an
 * administrator's later changes to it or to its memberships survive every restart.
 */
export async function provisionDemoAccounts(
  options: ProvisionDemoAccountsOptions,
): Promise<readonly string[]> {
  const created: string[] = [];
  for (const account of DEMO_ACCOUNTS) {
    const existing = await options.users.list({
      search: account.email,
      pageSize: 100,
    });
    if (existing.items.some((user) => user.email === account.email)) continue;
    if (!(await options.organization.getDepartment(account.departmentId)))
      continue;
    const user = await options.users.create({
      name: account.name,
      email: account.email,
      password: DEMO_PASSWORD,
    });
    await options.organization.addMember({
      departmentId: account.departmentId,
      userId: user.id,
      primary: true,
    });
    created.push(user.id);
  }
  return created;
}
