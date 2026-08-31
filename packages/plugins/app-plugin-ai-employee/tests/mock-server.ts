import type { Context } from '../server/context.js';
/**
 * Minimal test harness for repository-backed resource managers.
 */
import { AIManager } from '@nocobase/ai-employee';
import { MemorySkillsRepository } from '@nocobase/ai-employee';
import {
  TestAIEmployeeRepository,
  TestLLMServiceRepository,
  TestMCPRepository,
  TestToolsRepository,
} from './test-repositories.js';

export type TestAI = {
  aiManager: AIManager;
  context: Context;
  destroy(): Promise<void>;
  init(): Promise<void>;
};

export async function createMockServer(_options?: any): Promise<TestAI> {
  const context = {} as Context;
  const llmServiceRepository = new TestLLMServiceRepository();
  const aiManager = new AIManager({
    repositories: {
      employeeRepository: new TestAIEmployeeRepository(),
      toolsRepository: new TestToolsRepository(),
      skillsRepository: new MemorySkillsRepository(),
      mcpRepository: new TestMCPRepository(),
      llmServiceRepository,
    },
    context,
  });
  return {
    aiManager,
    context,
    destroy: async () => {},
    init: async () => {},
  };
}
