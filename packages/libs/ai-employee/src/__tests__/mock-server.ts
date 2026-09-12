/**
 * Minimal test harness for repository-backed resource managers.
 */
import { AIManager } from '../manager/index.js';
import { MemorySkillsRepository } from '../repository/memory/skill.js';
import {
  TestAIEmployeeRepository,
  TestLLMServiceRepository,
  TestMCPRepository,
  TestToolsRepository,
} from './test-repositories.js';

export type TestAI = {
  aiManager: AIManager;
  destroy(): Promise<void>;
  init(): Promise<void>;
};

export async function createMockServer(_options?: any): Promise<TestAI> {
  const llmServiceRepository = new TestLLMServiceRepository();
  const aiManager = new AIManager({
    repositories: {
      employeeRepository: new TestAIEmployeeRepository(),
      toolsRepository: new TestToolsRepository(),
      skillsRepository: new MemorySkillsRepository(),
      mcpRepository: new TestMCPRepository(),
      llmServiceRepository,
    },
  });
  return {
    aiManager,
    destroy: async () => {},
    init: async () => {},
  };
}
