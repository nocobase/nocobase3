import {
  anyScope,
  condition,
  scopeAst,
  type RecordAccessPolicy,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { MEMBERS, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
export function resolveOwnedSalesRecords(
  database: DatabaseManager,
  context: Parameters<RecordAccessPolicy['resolve']>[0],
): Promise<DatabaseScope> {
  return projectScope(
    database,
    context.collection.name,
    condition('ownerId', '$eq', context.principal.id),
  );
}
export async function resolveRegionalSalesRecords(
  database: DatabaseManager,
  context: Parameters<RecordAccessPolicy['resolve']>[0],
): Promise<DatabaseScope> {
  const member = await database
    .connection()
    .query.selectFrom(MEMBERS)
    .select('region')
    .where('id', '=', context.principal.id)
    .executeTakeFirst();
  return member
    ? projectScope(
        database,
        context.collection.name,
        condition('region', '$eq', String(member.region)),
      )
    : false;
}
export function resolvePublicSalesRecords(
  database: DatabaseManager,
  context: Parameters<RecordAccessPolicy['resolve']>[0],
): Promise<DatabaseScope> {
  return projectScope(
    database,
    context.collection.name,
    condition('confidential', '$isFalsy'),
  );
}
async function projectScope(
  database: DatabaseManager,
  collection: string,
  scope: DatabaseScope,
): Promise<DatabaseScope> {
  if (collection === PROJECTS || typeof scope === 'boolean') return scope;
  if (collection !== QUOTES && collection !== ORDERS)
    throw new TypeError('Unsupported sales scope target');
  const projects = await database
    .repository<{ id: string }>(PROJECTS)
    .withPolicy({
      read: { scope: scopeAst(PROJECTS, scope), fields: ['id'] },
      create: false,
      update: false,
      delete: false,
    })
    .findMany();
  return anyScope(
    projects.map((project) => condition('projectId', '$eq', project.id)),
  );
}
