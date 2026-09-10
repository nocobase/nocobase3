import { expect, it } from 'vitest';
import mssql from '../src/index.js';
it('binds its driver', () => expect(mssql().databaseDriver).toBe(mssql.driver));
