import knex, { type Knex } from 'knex';

export async function bootstrapExternalCrm(filename: string): Promise<void> {
  const client = knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
  });
  try {
    if (!(await client.schema.hasTable('crm_customers'))) {
      await client.schema.createTable('crm_customers', (table) => {
        table.increments('id');
        table.string('name', 128).notNullable();
        table.string('email', 255).notNullable().unique();
        table.string('company', 128).notNullable();
        table.string('status', 32).notNullable().defaultTo('active');
        table.timestamp('created_at').notNullable();
      });
    }
    if (!(await client.schema.hasTable('crm_contacts'))) {
      await client.schema.createTable('crm_contacts', (table) => {
        table.increments('id');
        table.integer('customer_id').notNullable();
        table.string('name', 128).notNullable();
        table.string('email', 255).notNullable();
        table.string('role', 128).notNullable();
        table.timestamp('created_at').notNullable();
        table
          .foreign('customer_id')
          .references('id')
          .inTable('crm_customers')
          .onDelete('CASCADE');
      });
    }
    await seedExternalCrm(client);
  } finally {
    await client.destroy();
  }
}

async function seedExternalCrm(client: Knex): Promise<void> {
  const [{ count }] = await client('crm_customers').count<{ count: number }[]>({
    count: '*',
  });
  if (Number(count) > 0) return;

  const createdAt = '2026-09-02 09:00:00';
  await client('crm_customers').insert([
    {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Analytical Engines Ltd.',
      status: 'active',
      created_at: createdAt,
    },
    {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      company: 'Compiler Systems Inc.',
      status: 'active',
      created_at: createdAt,
    },
    {
      name: 'Linus Torvalds',
      email: 'linus@example.com',
      company: 'Kernel Works',
      status: 'inactive',
      created_at: createdAt,
    },
  ]);
  await client('crm_contacts').insert([
    {
      customer_id: 1,
      name: 'Charles Babbage',
      email: 'charles@example.com',
      role: 'Technical contact',
      created_at: createdAt,
    },
    {
      customer_id: 2,
      name: 'Margaret Hamilton',
      email: 'margaret@example.com',
      role: 'Engineering contact',
      created_at: createdAt,
    },
  ]);
}
