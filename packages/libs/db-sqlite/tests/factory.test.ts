import { expect, it } from 'vitest';
import sqlite from '../src/index.js';
it('binds its driver', () =>
  expect(sqlite().databaseDriver).toBe(sqlite.driver));
