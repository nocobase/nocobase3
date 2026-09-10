import { describe, expect, it } from 'vitest';
import postgres from '../src/index.js';

describe('postgres factory', () => {
  it('binds the dialect driver to the connection', () => {
    const connection = postgres({ host: 'localhost' });
    expect(connection).toMatchObject({
      dialect: 'postgres',
      databaseDriver: postgres.driver,
      host: 'localhost',
    });
  });
});
