import { buildFilter } from '@nocobase/repository-input';
import type { RecordAccessContext } from '@nocobase/authorization/core';
import type { DatabaseManager, FilterAst } from '@nocobase/db';
import { MEMBERS, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
export function resolveOwnedSalesRecords(
  database: DatabaseManager,
  context: RecordAccessContext,
): Promise<boolean | FilterAst> {
  return projectScope(
    database,
    context.resource.id,
    buildFilter((filter) => filter.string('ownerId').eq(context.principal.id)),
  );
}
export async function resolveRegionalSalesRecords(
  database: DatabaseManager,
  context: RecordAccessContext,
): Promise<boolean | FilterAst> {
  const member = await database
    .connection()
    .query.selectFrom(MEMBERS)
    .select('region')
    .where('id', '=', context.principal.id)
    .executeTakeFirst();
  return member
    ? projectScope(
        database,
        context.resource.id,
        buildFilter((filter) =>
          filter.string('region').eq(String(member.region)),
        ),
      )
    : false;
}
export function resolvePublicSalesRecords(
  database: DatabaseManager,
  context: RecordAccessContext,
): Promise<boolean | FilterAst> {
  return projectScope(
    database,
    context.resource.id,
    buildFilter((filter) => filter.boolean('confidential').isFalse()),
  );
}
async function projectScope(
  database: DatabaseManager,
  collection: string,
  scope: boolean | FilterAst,
): Promise<boolean | FilterAst> {
  if (collection === PROJECTS || typeof scope === 'boolean') return scope;
  if (collection !== QUOTES && collection !== ORDERS)
    throw new TypeError('Unsupported sales scope target');
  const projects = await database
    .repository<{ id: string }>(PROJECTS)
    .withPolicy({
      read: { scope, fields: ['id'] },
      create: false,
      update: false,
      delete: false,
    })
    .findMany();
  return projects.length
    ? buildFilter((filter) =>
        filter.or(
          projects.map((project) => filter.string('projectId').eq(project.id!)),
        ),
      )
    : false;
}
