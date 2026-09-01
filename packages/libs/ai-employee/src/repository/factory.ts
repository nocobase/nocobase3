import type { AIEmployeeRepository } from './ai-employee.js';
import type { AIMCPRepository } from './ai-mcp.js';
import type { SkillsRepository } from './ai-skill.js';
import type { LLMServiceRepository } from './llm-service.js';
import type { ToolsRepository } from './tool.js';

/** Provides the shared in-memory repository instances consumed by AIManager. */
export interface RepositoryFactory {
  get employeeRepository(): AIEmployeeRepository;
  get toolsRepository(): ToolsRepository;
  get skillsRepository(): SkillsRepository;
  get mcpRepository(): AIMCPRepository;
  get llmServiceRepository(): LLMServiceRepository;
}
