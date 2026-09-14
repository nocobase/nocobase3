import type { Application } from '@nocobase/app-server/application';
import {
  appAuthorizationDatabase,
  authorizationToken,
  permissionSetsToken,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

export default class ArticlesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/articles';

  public override async boot(): Promise<void> {
    if (
      !this.app.container.has(databaseManagerToken) ||
      !this.app.container.has(permissionSetsToken)
    )
      return;
    const database = appAuthorizationDatabase(
      this.app.container.resolve(authorizationToken),
    );
    if (!database) return;
    const permissionSets = this.app.container.resolve(permissionSetsToken);
    // Initialize once for existing administrators. Later permission edits and revocations remain authoritative.
    if (await permissionSets.get('articles-manager')) return;
    const administrators = await permissionSets.listAssignments('root');
    if (!administrators.length) return;
    await permissionSets.create({
      key: 'articles-manager',
      title: '文章管理 / Article management',
      grants: [
        database.grant('articles', {
          read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
          // The route composes the timestamps it stores, so a write grant has
          // to cover them as well as the fields a caller sends.
          create: {
            fields: {
              input: [
                'title',
                'summary',
                'content',
                'status',
                'publishedAt',
                'createdAt',
                'updatedAt',
              ],
            },
          },
          update: {
            fields: {
              input: [
                'title',
                'summary',
                'content',
                'status',
                'publishedAt',
                'updatedAt',
              ],
            },
            recordAccess: ['allRecords'],
          },
        }),
      ],
    });
    for (const assignment of administrators) {
      await permissionSets.assign({
        permissionSet: 'articles-manager',
        subject: assignment.subject,
      });
    }
  }
}
