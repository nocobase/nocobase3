import type { AIEmployeeRepository } from '../ai-employee.js';
import type { AIMCPRepository } from '../ai-mcp.js';
import type { SkillsRepository } from '../ai-skill.js';
import type { RepositoryFactory } from '../factory.js';
import type { LLMServiceRepository } from '../llm-service.js';
import type { ToolsRepository } from '../tool.js';
import { MemoryAIEmployeeRepository } from './ai-employee.js';
import { MemoryMCPRepository } from './ai-mcp.js';
import { MemorySkillsRepository } from './skill.js';
import { MemoryLLMServiceRepository } from './llm-service.js';
import { MemoryToolsRepository } from './tool.js';

export class MemoryRepositoryFactory implements RepositoryFactory {
  readonly employeeRepository: AIEmployeeRepository =
    new MemoryAIEmployeeRepository();
  readonly toolsRepository: ToolsRepository = new MemoryToolsRepository();
  readonly skillsRepository: SkillsRepository = new MemorySkillsRepository();
  readonly mcpRepository: AIMCPRepository = new MemoryMCPRepository();
  readonly llmServiceRepository: LLMServiceRepository =
    new MemoryLLMServiceRepository();
}
