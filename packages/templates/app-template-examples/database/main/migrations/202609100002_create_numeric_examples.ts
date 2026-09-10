import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609100002_create_numeric_examples',
  async up({ builder }) {
    await builder.createCollection('numericExamples', (c) => {
      c.increments('id');
      c.string('sample', { length: 32, nullable: false });
      c.integer('integerValue').nullable();
      c.bigInt('bigintValue').nullable();
      c.decimal('decimalValue', { precision: 30, scale: 6 }).nullable();
      c.float('floatValue').nullable();
      c.double('doubleValue').nullable();
      c.unique('sample');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('numericExamples');
  },
});
export default migration;
