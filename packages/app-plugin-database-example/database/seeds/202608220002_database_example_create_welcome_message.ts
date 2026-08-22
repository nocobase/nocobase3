import { defineSeed, type SeedDefinition } from '@nocobase/database';

const seed: SeedDefinition = defineSeed({
  name: '202608220002_database_example_create_welcome_message',

  async run({ query }) {
    await query
      .insertInto('appPluginDatabaseExampleMessages')
      .values({
        message: 'Welcome from @nocobase/app-plugin-database-example',
        createdAt: new Date(),
      })
      .execute();
  },
});

export default seed;
