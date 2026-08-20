import {
  NODE_RUN_STATUS,
  type Processor,
  type WorkflowInstruction,
  type WorkflowInstructionResult,
  type WorkflowNode,
  type WorkflowNodeRun,
} from '../../src/index.js';

/**
 * Resolves with its own `config.value`, run through the variable resolver so a
 * test can assert on scope wiring without a production node type.
 */
export const echoInstruction: WorkflowInstruction = {
  async run(node: WorkflowNode, _input, processor: Processor): Promise<WorkflowInstructionResult> {
    return {
      status: NODE_RUN_STATUS.RESOLVED,
      result: processor.getParsedValue(node.config.value ?? node.key, node.id),
    };
  },
};

/**
 * The PENDING fixture of M1 §1.6.
 *
 * It exists only in tests: nothing in `src` is allowed to suspend a run yet, but
 * every branch of `Processor` that deals with a suspended nodeRun needs a carrier.
 * A test resumes it by dispatching `{ executionId, nodeRunId }`.
 */
export const pendingInstruction: WorkflowInstruction = {
  async run(): Promise<WorkflowInstructionResult> {
    return { status: NODE_RUN_STATUS.PENDING };
  },
  async resume(_node: WorkflowNode, nodeRun): Promise<WorkflowInstructionResult> {
    return { status: NODE_RUN_STATUS.RESOLVED, result: nodeRun?.result ?? null };
  },
};

/**
 * Suspends like `pendingInstruction`, but comes back with ERROR.
 *
 * Ported from the v2 cases "resuming with error should end execution" and
 * "resume error downstream in condition branch, should error".
 */
export const errorResumeInstruction: WorkflowInstruction = {
  async run(): Promise<WorkflowInstructionResult> {
    return { status: NODE_RUN_STATUS.PENDING };
  },
  async resume(_node: WorkflowNode, nodeRun): Promise<WorkflowInstructionResult> {
    return { status: NODE_RUN_STATUS.ERROR, result: nodeRun?.result ?? null };
  },
};

/** Resolves with an incrementing counter, so a re-run is distinguishable from the first run. */
export function createCounterInstruction(): WorkflowInstruction & { readonly calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    async run(): Promise<WorkflowInstructionResult> {
      calls += 1;
      return { status: NODE_RUN_STATUS.RESOLVED, result: calls };
    },
  };
}

/** Resolves only after `delayMs`, which is how a timeout can interrupt a live run. */
export function createSlowInstruction(delayMs: number): WorkflowInstruction {
  return {
    async run(): Promise<WorkflowInstructionResult> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { status: NODE_RUN_STATUS.RESOLVED, result: 'slow' };
    },
  };
}

/** Records the node keys it ran, in order. */
export function createTraceInstruction(trace: string[]): WorkflowInstruction {
  return {
    async run(node: WorkflowNode): Promise<WorkflowInstructionResult> {
      trace.push(node.key);
      return { status: NODE_RUN_STATUS.RESOLVED, result: node.key };
    },
  };
}

/** Fails with the configured status, so failure propagation out of a branch is observable. */
export function createFailingInstruction(status: number = NODE_RUN_STATUS.FAILED): WorkflowInstruction {
  return {
    async run(node: WorkflowNode): Promise<WorkflowInstructionResult> {
      return { status, result: { failedAt: node.key } };
    },
  };
}

export function nodeRunOf(nodeRuns: WorkflowNodeRun[], nodeKey: string): WorkflowNodeRun {
  const nodeRun = nodeRuns.find((candidate) => candidate.nodeKey === nodeKey);
  if (!nodeRun) {
    throw new Error(`No nodeRun for node "${nodeKey}"`);
  }
  return nodeRun;
}
