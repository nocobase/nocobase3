import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { ServiceResolver } from '@nocobase/service-provider';
import type { AgentContextProvider, AgentProviders } from '../types.js';
import { createAgentService, type AgentService } from './agent-service.js';
import { createAIEmployeeAgentProviders } from '../context/ai-employee/context.js';
import type { AIEmployeeAgentOptions } from '../context/ai-employee/options.js';
import type { ConversationPersistence } from '../contracts/persistence.js';

export const agentServiceFactoryToken: ServiceToken<AgentServiceFactory> =
  createServiceToken<AgentServiceFactory>(
    '@nocobase/app-plugin-ai-employee/agent-service-factory',
  );

export interface CreateEmployeeOptions extends AIEmployeeAgentOptions {}
export interface CreateAgentOptions {
  readonly context?: AgentContextProvider;
  readonly providers?: AgentProviders;
  readonly persistence?: ConversationPersistence;
}

export interface AgentServiceFactoryOptions {
  readonly container?: ServiceResolver;
  readonly createAIEmployee?: (
    options: CreateEmployeeOptions,
  ) => Promise<AgentService>;
  readonly createAgent?: (options: CreateAgentOptions) => Promise<AgentService>;
}

export class AgentServiceFactory {
  private readonly container?: ServiceResolver;
  private readonly aiEmployeeBuilder?: AgentServiceFactoryOptions['createAIEmployee'];
  private readonly agentBuilder?: AgentServiceFactoryOptions['createAgent'];

  public constructor(options: AgentServiceFactoryOptions = {}) {
    this.container = options.container;
    this.aiEmployeeBuilder =
      options.createAIEmployee ??
      (async (employeeOptions) => {
        return createAgentService(
          await createAIEmployeeAgentProviders(employeeOptions),
        );
      });
    this.agentBuilder = options.createAgent;
  }

  public async createAIEmployee(
    options: CreateEmployeeOptions,
  ): Promise<AgentService> {
    if (!this.aiEmployeeBuilder)
      throw new Error('AI employee agent builder is not configured');
    return this.aiEmployeeBuilder(options);
  }

  public async createAgent(
    options: CreateAgentOptions = {},
  ): Promise<AgentService> {
    if (this.agentBuilder) return this.agentBuilder(options);
    if (options.providers) return createAgentService(options.providers);
    throw new Error('Fixed agent builder is not configured');
  }

  public get resolver(): ServiceResolver | undefined {
    return this.container;
  }
}

export type AgentServiceFactoryResult = AgentService;

export async function createAIEmployee(
  options: CreateEmployeeOptions,
): Promise<AgentService> {
  return new AgentServiceFactory().createAIEmployee(options);
}
