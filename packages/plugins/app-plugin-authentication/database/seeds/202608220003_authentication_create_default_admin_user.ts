import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

const seed: SeedDefinition = defineSeed({
  name: '202608220003_authentication_create_default_admin_user',
  async run({ query, config }) {
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existingUser) return;
    const initialAdmin = config.get<unknown>('users.initialAdmin');
    const credentials =
      initialAdmin === undefined
        ? { username: 'nocobase', password: 'admin123' }
        : initialAdmin;
    if (
      !credentials ||
      typeof credentials !== 'object' ||
      Array.isArray(credentials)
    ) {
      throw new Error('users.initialAdmin must be an object.');
    }
    const { username = 'nocobase', password } = credentials as Record<
      string,
      unknown
    >;
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9_.]{3,30}$/.test(username)
    ) {
      throw new Error(
        'users.initialAdmin.username must contain 3–30 letters, digits, underscores or dots.',
      );
    }
    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new Error(
        'users.initialAdmin.password is required when users.initialAdmin is configured.',
      );
    }
    const now = new Date();
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await query
      .insertInto('user')
      .values({
        id: userId,
        name: 'Super Admin',
        username: username.toLowerCase(),
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
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default seed;
