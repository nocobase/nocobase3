import type { RepositoryFactory } from '../repository/factory.js';
import { MemoryRepositoryFactory } from '../repository/memory/factory.js';
import type { Context } from '../app/context.js';
import { DefaultAIEmployeeManager } from './ai-employee/index.js';
import type { AIEmployeeManager } from './ai-employee/types.js';
import { DocumentManager } from './document/index.js';
import { DefaultAIFeatureManager } from './features/index.js';
import type { AIFeatureManager } from './features/types.js';
import { LLMProviderManager } from './llm-provider/index.js';
import { DefaultLLMServiceManager } from './llm-service/index.js';
import type { LLMServiceManager } from './llm-service/types.js';
import { DefaultMCPServerManager } from './mcp-server/index.js';
import type { MCPRuntime, MCPServerManager } from './mcp-server/types.js';
import { McpToolsManager } from './mcp-tools/index.js';
import { DefaultSkillsManager } from './skills/index.js';
import type { SkillsManager } from './skills/types.js';
import { DefaultToolsManager } from './tools/index.js';
import type { ToolsManager } from './tools/types.js';

/** Dependencies required to create the repository-backed AI manager aggregate. */
export type AIManagerOptions = {
  repositories: RepositoryFactory;
  context: Context;
  mcpRuntime?: MCPRuntime;
};

/** Aggregates repository-backed resource managers without depending on an App port. */
export class AIManager {
  readonly context: Context;
  documentManager: DocumentManager;
  toolsManager: ToolsManager;
  skillsManager: SkillsManager;
  employeeManager: AIEmployeeManager;
  mcpServerManager: MCPServerManager;
  llmServiceManager: LLMServiceManager;
  llmProviderManager: LLMProviderManager;
  mcpToolsManager: McpToolsManager;
  features: AIFeatureManager;

  constructor(options: AIManagerOptions) {
    const { repositories } = options;
    this.context = options.context;
    this.documentManager = new DocumentManager();
    this.toolsManager = new DefaultToolsManager(repositories.toolsRepository);
    this.skillsManager = new DefaultSkillsManager(
      repositories.skillsRepository,
    );
    this.employeeManager = new DefaultAIEmployeeManager(
      repositories.employeeRepository,
    );
    this.mcpServerManager = new DefaultMCPServerManager(
      repositories.mcpRepository,
      options.mcpRuntime,
    );
    this.llmServiceManager = new DefaultLLMServiceManager(
      repositories.llmServiceRepository,
    );
    this.llmProviderManager = new LLMProviderManager(
      options.context,
      repositories.llmServiceRepository,
    );
    this.mcpToolsManager = new McpToolsManager();
    this.features = new DefaultAIFeatureManager();
  }
}

export * from './ai-employee/index.js';
export * from './document/index.js';
export * from './file/index.js';
export * from './features/index.js';
export * from './llm-provider/index.js';
export * from './llm-service/index.js';
export * from './mcp-server/index.js';
export * from './mcp-tools/index.js';
export * from './skills/index.js';
export * from './tools/index.js';
