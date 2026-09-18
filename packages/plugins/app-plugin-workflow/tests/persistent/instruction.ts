import path from 'node:path';
import { NODE_RUN_STATUS } from '../../server/engine/constants.js';
import type { JsonObject } from '../../server/engine/types.js';
import {
  WorkflowInstruction,
  type WorkflowInstructionClass,
  type WorkflowInstructionResult,
} from '../../server/instructions/base.js';
import { createNodeExpression } from '../../server/instructions/definition.js';
import type {
  ConfigIssue,
  NodeExpression,
  WorkflowNodeSourceInput,
} from '../../server/instructions/types.js';
import { DurableBusinessEffect } from './business.js';

export const businessInstructionType = 'acceptance-business-effect';

/** Registered through WorkflowService, executed only by the real Processor. */
export function createBusinessInstruction(
  root: string,
): WorkflowInstructionClass {
  return class BusinessInstruction extends WorkflowInstruction {
    static readonly type: string = businessInstructionType;
    static readonly branches: null = null;
    static readonly result: null = null;

    static create(source: WorkflowNodeSourceInput<JsonObject>): NodeExpression {
      return createNodeExpression(BusinessInstruction, source);
    }

    static validateConfig(_config: unknown): ConfigIssue[] {
      return [];
    }

    async run(): Promise<WorkflowInstructionResult> {
      const input = this.processor.execution.input;
      if (typeof input.businessKey !== 'string') {
        throw new Error('Expected a durable business key');
      }
      const business = new DurableBusinessEffect(
        path.join(root, 'business.sqlite'),
      );
      try {
        business.apply(input.businessKey, input);
      } finally {
        business.close();
      }
      return {
        status: NODE_RUN_STATUS.RESOLVED,
        result: { businessKey: input.businessKey, committed: true, input },
      };
    }
  };
}
