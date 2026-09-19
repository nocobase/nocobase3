import { expect, it } from 'vitest';
import {
  recordsIOwn,
  recordsICreated,
  UserContextRequiredError,
} from '../server/database/record-access.js';
const collection = {
  name: 'orders',
  fields: ['id', 'ownerId', 'createdById'],
  primaryKey: 'id',
  generatedPrimaryKey: true,
};
it.each([recordsIOwn(), recordsICreated()])(
  'requires a user identity for $key instead of using a department id',
  (policy) => {
    const context = { collection, action: 'read', params: undefined };
    expect(() =>
      policy.resolve({
        ...context,
        principal: { type: 'department', id: 'sales' },
      }),
    ).toThrow(UserContextRequiredError);
    expect(
      policy.resolve({ ...context, principal: { type: 'user', id: 'alice' } }),
    ).toMatchObject({ kind: 'condition', value: 'alice' });
  },
);
