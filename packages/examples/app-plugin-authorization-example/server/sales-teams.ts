import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { label } from '../catalog.js';

export const TEAM_SUBJECT = 'example.sales.team';
export function registerSalesTeams(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): () => void {
  const teams = async () =>
    database
      .connection()
      .query.selectFrom('authorizationExampleTeams')
      .select(['id', 'title'])
      .where('active', '=', true)
      .execute();
  return authz.subjects.define(TEAM_SUBJECT, {
    async resolveFor(principal) {
      if (principal.type !== 'user') return [];
      const memberships = await database
        .connection()
        .query.selectFrom('authorizationExampleTeamMembers')
        .select('teamId')
        .where('userId', '=', principal.id)
        .execute();
      return memberships.map((row) => String(row.teamId));
    },
    async filterActive(ids) {
      return (await teams())
        .filter((row) => ids.includes(String(row.id)))
        .map((row) => String(row.id));
    },
    administration: {
      title: label('teams.subject'),
      selection: {
        type: 'collection',
        async list({ search, page, pageSize }) {
          const rows = (await teams()).filter(
            (row) =>
              !search ||
              String(row.title).toLowerCase().includes(search.toLowerCase()),
          );
          return {
            items: rows
              .slice((page - 1) * pageSize, page * pageSize)
              .map((row) => ({ id: String(row.id), title: String(row.title) })),
            total: rows.length,
          };
        },
        async resolve(ids) {
          return (await teams())
            .filter((row) => ids.includes(String(row.id)))
            .map((row) => ({ id: String(row.id), title: String(row.title) }));
        },
      },
    },
  });
}
