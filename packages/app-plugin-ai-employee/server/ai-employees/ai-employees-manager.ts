/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type {
  DatabaseRepositoryFactory,
  AIEmployeeEntity,
} from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import type { ModelRef } from './ai-employee.js';

export class AIEmployeesManager {
  /** Legacy controllers are retained for workflow and compatibility callers. */
  conversationController = new Map<string, AbortController>();
  private readonly agentAbortHandles = new Map<
    string,
    Map<symbol, { abort(reason?: unknown): void }>
  >();

  constructor(
    private readonly repositories: DatabaseRepositoryFactory,
    private readonly ai: AIManager,
    private readonly sendSyncMessage?: (message: unknown) => void,
  ) {}

  registerAgentAbortHandle(
    sessionId: string,
    token: symbol,
    handle: { abort(reason?: unknown): void },
  ) {
    let handles = this.agentAbortHandles.get(sessionId);
    if (!handles) {
      handles = new Map();
      this.agentAbortHandles.set(sessionId, handles);
    }
    handles.set(token, handle);
  }

  unregisterAgentAbortHandle(sessionId: string, token: symbol) {
    const handles = this.agentAbortHandles.get(sessionId);
    handles?.delete(token);
    if (handles && handles.size === 0) this.agentAbortHandles.delete(sessionId);
  }

  private abortAgentServices(sessionId: string, reason?: unknown) {
    const handles = this.agentAbortHandles.get(sessionId);
    if (!handles?.size) return false;
    for (const handle of handles.values()) handle.abort(reason);
    return true;
  }

  async getEmployee(username: string): Promise<AIEmployeeEntity | null> {
    return await this.repositories.aiEmployees.findOne({
      filter: {
        username,
      },
    });
  }

  async resolveModel(
    employee: AIEmployeeEntity,
    model?: ModelRef | null,
  ): Promise<ModelRef> {
    const modelSettings = employee.modelSettings;
    if (modelSettings?.enabled) {
      const models = Array.isArray(modelSettings.models)
        ? modelSettings.models
        : [];
      const configuredModels = models
        .filter((item) => item?.llmService && item?.model)
        .map((item) => ({
          llmService: item.llmService,
          model: item.model,
        }));
      if (
        !configuredModels.length &&
        modelSettings.llmService &&
        modelSettings.model
      ) {
        configuredModels.push({
          llmService: modelSettings.llmService,
          model: modelSettings.model,
        });
      }
      if (!configuredModels.length) {
        throw new Error('AI employee model not configured');
      }

      if (
        model?.llmService &&
        model?.model &&
        configuredModels.some(
          (item) =>
            item.llmService === model.llmService && item.model === model.model,
        )
      ) {
        return model;
      }

      const firstModel = configuredModels[0];
      if (firstModel?.llmService && firstModel?.model) {
        return {
          llmService: firstModel.llmService,
          model: firstModel.model,
        };
      }
    }

    if (model?.llmService && model?.model) {
      return model;
    }

    return await this.ai.llmProviderManager.resolveModel();
  }

  onAbortConversation(sessionId: string) {
    const abortedAgent = this.abortAgentServices(
      sessionId,
      'Conversation aborted',
    );
    const controller = this.conversationController.get(sessionId);
    if (controller) {
      controller.abort();
      this.conversationController.delete(sessionId);
    }
    return abortedAgent || Boolean(controller);
  }

  abortConversation(sessionId: string) {
    const aborted = this.onAbortConversation(sessionId);
    if (!aborted) {
      this.sendSyncMessage?.({
        type: 'aiEmployees:abortConversation',
        payload: {
          sessionId,
        },
      });
    }
  }
}
