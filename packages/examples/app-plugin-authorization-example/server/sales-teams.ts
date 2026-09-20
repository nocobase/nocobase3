import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import { label } from '../catalog.js';

export const TEAM_SUBJECT = 'example.sales.team';
const TEAMS = 'authorizationExampleTeams';

export function registerSalesTeams(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): () => void {
  return authz.subjects.define<DatabaseConnection>(TEAM_SUBJECT, {
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
    async filterActive(ids, transaction) {
      if (!ids.length) return [];
      const rows = await (transaction ?? database.connection()).query
        .selectFrom(TEAMS)
        .select('id')
        .where('active', '=', true)
        .where('id', 'in', ids)
        .execute();
      return rows.map((row) => String(row.id));
    },
    administration: {
      title: label('teams.subject'),
      selection: {
        type: 'collection',
        async list({ search, page, pageSize }) {
          const teams = database.repository<{
            id: string;
            title: string;
            active: boolean;
          }>(TEAMS);
          const filter = buildFilter((f) =>
            f.and([
              f.boolean('active').isTrue(),
              ...(search
                ? [f.string('title').includes(search, { mode: 'insensitive' })]
                : []),
            ]),
          );
          const [rows, total] = await Promise.all([
            teams.findMany({
              filter,
              select: (s) => s.fields('id', 'title'),
              sort: (s) => [s.field('title').asc(), s.field('id').asc()],
              offset: (page - 1) * pageSize,
              limit: pageSize,
            }),
            teams.count({ filter }),
          ]);
          return {
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
            })),
            total,
          };
        },
        async resolve(ids) {
          if (!ids.length) return [];
          const rows = await database
            .connection()
            .query.selectFrom(TEAMS)
            .select(['id', 'title'])
            .where('active', '=', true)
            .where('id', 'in', ids)
            .orderBy('id', 'asc')
            .execute();
          return rows.map((row) => ({
            id: String(row.id),
            title: String(row.title),
          }));
        },
      },
    },
  });
}
