import { expect, it } from 'vitest';
import mysql from '../src/index.js';
it('binds its driver', () => expect(mysql().databaseDriver).toBe(mysql.driver));
