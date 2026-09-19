import { setTimeout as delay } from 'node:timers/promises';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';

/** This demonstration workspace grants each authenticated user their own records. */
export function registerCustomerAuthorization(
  authorization: AppAuthorization,
  database: DatabaseManager,
): void {
  authorization.resources.add({
    resourceType: 'audit-example.customer',
    async authorize(request, context) {
      let permit = false;
      const grants = await context.grants.resolve(request);
      if (
        request.principal.type === 'user' &&
        grants.some((grant) => grant.policy === undefined)
      ) {
        const ownerId = request.principal.id;
        if (
          request.resource.id === '*' &&
          ['list', 'create', 'readLogs'].includes(request.action)
        )
          permit = true;
        else if (['update', 'delete'].includes(request.action)) {
          permit = await database
            .repository('auditExampleCustomers')
            .exists({ filter: { id: request.resource.id, ownerId } });
        }
      }
      return {
        effect: permit ? 'permit' : 'deny',
        reasons: [
          {
            code: permit ? 'CUSTOMER_OWNER_ALLOWED' : 'CUSTOMER_ACCESS_DENIED',
            message: permit
              ? 'Customer owner access allowed.'
              : 'Customer access denied.',
          },
        ],
      };
    },
  });
}

/** Initialize atomically once; preserve later administrative edits. */
export async function initializeCustomerPermissions(
  authorization: AppAuthorization,
  database: DatabaseManager,
): Promise<void> {
  const key = 'audit-example-member';
  for (let attempt = 0; ; attempt++) {
    if (await authorization.permissionSets.get(key)) return;
    try {
      await database.transaction(async (connection) => {
        const scoped = createAppAuthorization({ connection });
        await scoped.permissionSets.create({
          key,
          title: 'Customer audit example',
          grants: [
            {
              resource: { type: 'audit-example.customer', id: '*' },
              actions: ['list', 'create', 'readLogs', 'update', 'delete'].map(
                (action) => ({ action }),
              ),
            },
          ],
        });
        await scoped.permissionSets.assign({
          permissionSet: key,
          subject: { type: 'authenticated', id: '*' },
        });
      });
      return;
    } catch (error) {
      // Our transaction has rolled back. A visible set belongs to a competing
      // initializer that committed both records; never restore revoked membership.
      if (await authorization.permissionSets.get(key)) return;
      if (attempt >= 5 || !isInitializationContention(error)) throw error;
      await delay(10 * 2 ** attempt);
    }
  }
}

function isInitializationContention(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code: unknown = Reflect.get(error, 'code');
  return (
    typeof code === 'string' &&
    [
      'SQLITE_BUSY',
      'SQLITE_BUSY_SNAPSHOT',
      'SQLITE_LOCKED',
      '40001',
      '40P01',
      'ER_LOCK_DEADLOCK',
      'ER_LOCK_WAIT_TIMEOUT',
    ].includes(code)
  );
}
