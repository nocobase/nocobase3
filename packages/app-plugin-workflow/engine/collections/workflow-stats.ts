import type { CollectionDefinitionBuilder } from '@nocobase/database';

export function defineWorkflowStats(
  collection: CollectionDefinitionBuilder,
): void {
  collection.string('key').primary().notNull();
  collection.bigInt('executed').notNull().defaultTo(0);
}
