import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createUsersAIEmployeeCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'usersAiEmployees',
    (c) => {
      c.string('userId').notNull();
      c.string('aiEmployee').notNull();
      c.integer('sort').nullable();
      c.text('prompt').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary(['userId', 'aiEmployee'], { name: 'pk_users_ai_employees' });
      c.foreignKey('aiEmployee', {
        references: { collection: 'aiEmployees', fields: ['username'] },
        onDelete: 'cascade',
      });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}
