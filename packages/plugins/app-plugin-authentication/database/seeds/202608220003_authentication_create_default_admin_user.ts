import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

const seed: SeedDefinition = defineSeed({
  name: '202608220003_authentication_create_default_admin_user',

  async run({ query }) {
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existingUser) {
      return;
    }

    const now = new Date();
    const userId = crypto.randomUUID();

    await query
      .insertInto('user')
      .values({
        id: userId,
        name: 'nocobase',
        username: 'nocobase',
        email: 'admin@nocobase.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await query
      .insertInto('account')
      .values({
        id: crypto.randomUUID(),
        issuer: 'local:credential',
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword('admin123'),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default seed;
