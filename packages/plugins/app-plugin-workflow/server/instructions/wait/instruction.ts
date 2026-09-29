import { NODE_RUN_STATUS } from '../../engine/constants.js';
import { asId, asIdFilter } from '../../engine/utils.js';
import type { JsonObject } from '../../engine/types.js';
import { createNodeExpression } from '../../../dsl/definition.js';
import {
  WorkflowInstruction,
  type WorkflowInstructionResult,
} from '../base.js';
import type {
  ConfigIssue,
  NodeExpression,
  WorkflowNodeSourceInput,
} from '../types.js';
import { WaitInstructionApi } from './api.js';

export type WaitConfig = JsonObject & { correlation?: unknown };

export class WaitInstruction extends WorkflowInstruction<WaitConfig> {
  static readonly type = 'wait' as const;
  static readonly branches: null = null;
  static readonly result: null = null;
  static readonly createApi = (
    context: ConstructorParameters<typeof WaitInstructionApi>[0],
  ): WaitInstructionApi => new WaitInstructionApi(context);

  static create(source: WorkflowNodeSourceInput<WaitConfig>): NodeExpression {
    return createNodeExpression(WaitInstruction, source);
  }

  static validateConfig(config: unknown): ConfigIssue[] {
    if (!config || typeof config !== 'object' || Array.isArray(config))
      return [{ path: 'config', message: 'wait config must be an object' }];
    return Object.keys(config)
      .filter((key) => key !== 'correlation')
      .map((key) => ({
        path: `config.${key}`,
        message: `wait config does not accept field "${key}"`,
      }));
  }

  async run(): Promise<WorkflowInstructionResult> {
    const issues = WaitInstruction.validateConfig(this.config);
    if (issues.length)
      throw new TypeError(issues.map((issue) => issue.message).join('; '));
    const correlation =
      this.config.correlation === undefined
        ? null
        : this.processor.getParsedValue(this.config.correlation, this.node);
    return { status: NODE_RUN_STATUS.PENDING, meta: { wait: { correlation } } };
  }

  async resume(): Promise<WorkflowInstructionResult> {
    const requestId = this.processor.waitRequestId;
    if (!requestId) throw new Error('Wait resume requires a persisted request');
    const request = await this.processor.store.waitRequests.findOne({
      filter: { id: requestId },
    });
    if (
      !request ||
      String(asId(request.nodeRunId)) !== String(this.nodeRun.id) ||
      String(asId(request.workflowRunId)) !==
        String(this.processor.execution.id) ||
      request.state !== 'processing'
    )
      throw new Error('Wait resume request is invalid');
    const stillPending = await this.processor.store.nodeRuns.exists({
      filter: {
        id: asIdFilter(this.nodeRun.id),
        status: NODE_RUN_STATUS.PENDING,
      },
    });
    if (!stillPending) throw new Error('Wait node is no longer pending');
    return {
      status: Number(request.status),
      result: request.result,
      ...(request.error == null ? {} : { error: request.error as string }),
      meta: this.nodeRun.meta,
    };
  }
}
