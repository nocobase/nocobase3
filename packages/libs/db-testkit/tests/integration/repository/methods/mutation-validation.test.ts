import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository methods/mutation-validation',
  (context) => {
    it('describes and validates executable relation capabilities', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');

      await expect(
        repository.describeMutation({ operation: 'updateOne' }),
      ).resolves.toEqual({
        collection: 'repositoryProjects',
        operation: 'updateOne',
        relations: [
          {
            field: 'owner',
            cardinality: 'one',
            targetCollection: 'repositoryUsers',
            allowedActions: ['set', 'modify', 'clear'],
            modifyOperations: ['update', 'upsert', 'delete'],
            patchOperations: undefined,
            uniqueFieldSets: [
              { fields: ['id'], primary: true },
              { fields: ['email'], primary: false },
            ],
          },
          {
            field: 'tasks',
            cardinality: 'many',
            targetCollection: 'repositoryTasks',
            allowedActions: ['patch', 'replace'],
            modifyOperations: undefined,
            patchOperations: [
              'connect',
              'create',
              'disconnect',
              'update',
              'upsert',
              'delete',
            ],
            uniqueFieldSets: [
              { fields: ['id'], primary: true },
              { fields: ['externalId'], primary: false },
            ],
          },
          {
            field: 'profile',
            cardinality: 'one',
            targetCollection: 'repositoryProjectProfiles',
            allowedActions: ['set', 'modify', 'clear'],
            modifyOperations: ['update', 'upsert', 'delete'],
            patchOperations: undefined,
            uniqueFieldSets: [{ fields: ['id'], primary: true }],
          },
          {
            field: 'tags',
            cardinality: 'many',
            targetCollection: 'repositoryTagsForMutation',
            through: {
              collection: 'repositoryProjectTags',
              writableFields: ['role', 'weight'],
              requiredOnCreate: [],
            },
            allowedActions: ['patch', 'replace'],
            modifyOperations: undefined,
            patchOperations: [
              'connect',
              'create',
              'disconnect',
              'update',
              'upsert',
              'delete',
            ],
            uniqueFieldSets: [
              { fields: ['id'], primary: true },
              { fields: ['label'], primary: false },
            ],
          },
        ],
        limits: { maxDepth: 3, maxNodes: 100 },
      });

      await expect(
        repository.validateMutation({
          operation: 'createOne',
          values: {
            name: 'Invalid',
            owner: { disconnect: true } as never,
          },
        }),
      ).resolves.toMatchObject({
        valid: false,
        errors: [{ code: 'RELATION_ACTION_NOT_ALLOWED', relation: 'owner' }],
      });
      await expect(
        repository.validateMutation({
          operation: 'updateOne',
          filter: { name: 'Project' },
          values: { name: 'Updated project' },
        }),
      ).resolves.toEqual({ valid: true, errors: [] });
      await expect(
        repository.findMany({ filter: { metadata: '{}' } }),
      ).rejects.toMatchObject({
        code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
        field: 'metadata',
      });
      await expect(
        repository.findMany({ filter: { owner: fixture.ada as number } }),
      ).rejects.toMatchObject({
        code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
        field: 'owner',
      });
    });
  },
);
