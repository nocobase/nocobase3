import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Fixed learning data is intentional in the Examples template. Exact numeric
// inputs use strings. Most fractions are binary-exact; 0.1 demonstrates rounding.
const seed: SeedDefinition = defineSeed({
  name: '202609100002_seed_numeric_examples',
  async run({ query }) {
    const samples = [
      {
        sample: 'small',
        integerValue: 42,
        bigintValue: '42',
        decimalValue: '42.000000',
        floatValue: 42,
        doubleValue: 42,
      },
      {
        sample: 'negative',
        integerValue: -42,
        bigintValue: '-42',
        decimalValue: '-42.500000',
        floatValue: -42.5,
        doubleValue: -42.5,
      },
      {
        sample: 'zero',
        integerValue: 0,
        bigintValue: '0',
        decimalValue: '0.000000',
        floatValue: 0,
        doubleValue: 0,
      },
      {
        sample: 'large',
        integerValue: 2147483647,
        bigintValue: '9007199254740992',
        decimalValue: '100000000000000.250000',
        floatValue: 1.25,
        doubleValue: 1.25,
      },
      {
        sample: 'adjacent',
        integerValue: -2147483648,
        bigintValue: '9007199254740993',
        decimalValue: '0.125000',
        floatValue: 0.125,
        doubleValue: 0.125,
      },
      {
        sample: 'fraction',
        integerValue: 1,
        bigintValue: '1',
        decimalValue: '0.100000',
        floatValue: 0.1,
        doubleValue: 0.1,
      },
      {
        sample: 'null',
        integerValue: null,
        bigintValue: null,
        decimalValue: null,
        floatValue: null,
        doubleValue: null,
      },
    ];
    for (const row of samples) {
      const existing = await query
        .selectFrom('numericExamples')
        .select('id')
        .where('sample', '=', row.sample)
        .executeTakeFirst();
      if (!existing)
        await query.insertInto('numericExamples').values(row).execute();
    }
  },
});
export default seed;
