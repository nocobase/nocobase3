import { defineSeed, type SeedDefinition } from '@nocobase/database';

const seed: SeedDefinition = defineSeed({
  name: '202608220002_example_create_welcome_message',

  async run({ query }) {
    await query
      .insertInto('app_plugin_example_messages')
      .values({
        message: 'Welcome from @nocobase/app-plugin-example',
        created_at: new Date(),
      })
      .execute();
  },
});

export default seed;
