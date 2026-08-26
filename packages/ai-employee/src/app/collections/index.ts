import type { DatabaseConnection } from '@nocobase/app-database';

import { createAIEmployeeCollection } from './ai-employee.js';
import { createAIConversationCollection } from './ai-conversation.js';
import { createAIFileCollection } from './ai-file.js';
import { createAIMCPClientCollection } from './ai-mcp-client.js';
import { createAIMessageCollection } from './ai-message.js';
import { createAISettingsCollection } from './ai-settings.js';
import { createAIToolMessageCollection } from './ai-tool-message.js';
import { createAIUsageEventCollection } from './ai-usage-event.js';
import { createLCCheckpointCollection } from './lc-checkpoint.js';
import { createLCCheckpointBlobCollection } from './lc-checkpoint-blob.js';
import { createLCCheckpointWriteCollection } from './lc-checkpoint-write.js';
import { createLLMServiceCollection } from './llm-service.js';
import { createUsersAIEmployeeCollection } from './users-ai-employee.js';

export { createAIEmployeeCollection } from './ai-employee.js';
export { createAIConversationCollection } from './ai-conversation.js';
export { createAIFileCollection } from './ai-file.js';
export { createAIMCPClientCollection } from './ai-mcp-client.js';
export { createAIMessageCollection } from './ai-message.js';
export { createAISettingsCollection } from './ai-settings.js';
export { createAIToolMessageCollection } from './ai-tool-message.js';
export { createAIUsageEventCollection } from './ai-usage-event.js';
export { createLCCheckpointCollection } from './lc-checkpoint.js';
export { createLCCheckpointBlobCollection } from './lc-checkpoint-blob.js';
export { createLCCheckpointWriteCollection } from './lc-checkpoint-write.js';
export { createLLMServiceCollection } from './llm-service.js';
export { createUsersAIEmployeeCollection } from './users-ai-employee.js';

export async function initializeAIEmployeeCollections(
  connection: DatabaseConnection,
): Promise<void> {
  const builder = connection.builder;
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
}
