import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Keep the historical address projection independent of evolving runtime mappers.
function addresses(value: unknown): string {
  if (typeof value === 'string') value = JSON.parse(value) as unknown;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value))
    return value.map(addresses).filter(Boolean).join(' ');
  const record = value as Record<string, unknown>;
  if ('address' in record)
    return [record.name, record.address]
      .filter((item) => typeof item === 'string' && item.length > 0)
      .join(' ');
  return [addresses(record.to), addresses(record.cc), addresses(record.bcc)]
    .filter(Boolean)
    .join(' ');
}

const migration: MigrationDefinition = defineMigration({
  name: '202609170001_add_mail_address_search',
  async up({ builder, query }) {
    await builder.alterCollection('mailMessages', (collection) => {
      collection.text('senderSearch');
      collection.text('recipientsSearch');
    });
    let after: string | undefined;
    while (true) {
      let select = query
        .selectFrom('mailMessages')
        .select(['id', 'sender', 'recipients'])
        .orderBy('id', 'asc')
        .limit(100);
      if (after) select = select.where('id', '>', after);
      const rows = await select.execute<{
        id: string;
        sender: unknown;
        recipients: unknown;
      }>();
      if (rows.length === 0) break;
      for (const row of rows)
        await query
          .updateTable('mailMessages')
          .set({
            senderSearch: addresses(row.sender),
            recipientsSearch: addresses(row.recipients),
          })
          .where('id', '=', row.id)
          .execute();
      after = rows.at(-1)!.id;
    }
  },
  async down({ builder }) {
    await builder.alterCollection('mailMessages', (collection) => {
      collection.dropField('senderSearch');
      collection.dropField('recipientsSearch');
    });
  },
});
export default migration;
