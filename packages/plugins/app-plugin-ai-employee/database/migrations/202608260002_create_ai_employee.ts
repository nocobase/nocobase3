import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';
import {
  createAIEmployeeCollection,
  createAIConversationCollection,
  createAIFileCollection,
  createAIMCPClientCollection,
  createAIMessageCollection,
  createAISettingsCollection,
  createAIToolMessageCollection,
  createAIUsageEventCollection,
  createLCCheckpointCollection,
  createLCCheckpointBlobCollection,
  createLCCheckpointWriteCollection,
  createLLMServiceCollection,
  createUsersAIEmployeeCollection,
} from '../collections/index.js';

const migration: MigrationDefinition = defineMigration({
  name: '202608260002_create_ai_employee',
  async up({ builder }: MigrationContext): Promise<void> {
    await createAIEmployeeCollection(builder);
    await createAIMCPClientCollection(builder);
    await createLLMServiceCollection(builder);
    await createAIConversationCollection(builder);
    await createAIMessageCollection(builder);
    await createAIToolMessageCollection(builder);
    await createAIFileCollection(builder);
    await createAISettingsCollection(builder);
    await createAIUsageEventCollection(builder);
    await createUsersAIEmployeeCollection(builder);
    await createLCCheckpointCollection(builder);
    await createLCCheckpointBlobCollection(builder);
    await createLCCheckpointWriteCollection(builder);
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('lcCheckpointWrites');
    await builder.dropCollection('lcCheckpointBlobs');
    await builder.dropCollection('lcCheckpoints');
    await builder.dropCollection('usersAiEmployees');
    await builder.dropCollection('aiUsageEvents');
    await builder.dropCollection('aiSettings');
    await builder.dropCollection('aiFiles');
    await builder.dropCollection('aiToolMessages');
    await builder.dropCollection('aiMessages');
    await builder.dropCollection('aiConversations');
    await builder.dropCollection('llmServices');
    await builder.dropCollection('aiMcpClients');
    await builder.dropCollection('aiEmployees');
  },
});

export default migration;
