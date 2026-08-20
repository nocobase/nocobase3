import { NODE_RUN_STATUS } from '../constants.js';
import type Processor from '../processor.js';
import type {
  JsonObject,
  WorkflowInstruction,
  WorkflowInstructionResult,
  WorkflowNode,
  WorkflowNodeRun,
} from '../types.js';

/**
 * Branch keys of the `condition` node.
 *
 * D4: a `branchKey` is always a semantic string. There is no numeric
 * `branchIndex` and no alias mapping layer — what the DSL writes is what the
 * `workflowNodes.branchKey` column stores.
 */
export const CONDITION_BRANCH_KEYS = {
  yes: 'yes',
  no: 'no',
} as const;

export type ConditionBranchKey = (typeof CONDITION_BRANCH_KEYS)[keyof typeof CONDITION_BRANCH_KEYS];

export type ConditionComparator =
  | 'equal'
  | 'notEqual'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'includes'
  | 'notIncludes'
  | 'startsWith'
  | 'notStartsWith'
  | 'endsWith'
  | 'notEndsWith';

export interface ConditionComparison {
  calculator?: ConditionComparator;
  operands?: unknown[];
}

export interface ConditionGroup {
  group: {
    type: 'and' | 'or';
    calculations?: ConditionCalculation[];
  };
}

export type ConditionCalculation = ConditionComparison | ConditionGroup;

export interface ConditionConfig {
  /** An omitted or incomplete calculation evaluates to `true`, as in the v2 engine. */
  calculation?: ConditionCalculation;
}

type Comparer = (left: unknown, right: unknown) => boolean;

type Ordinal = number | string;

/**
 * Normalize an operand for ordering comparisons.
 *
 * Dates and date-like values compare by epoch milliseconds; everything else
 * keeps the JavaScript relational semantics of "two strings compare as text,
 * anything else compares numerically".
 */
function toOrdinal(value: unknown): Ordinal {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

function order(left: unknown, right: unknown, compare: (result: number) => boolean): boolean {
  const isDatePair = left instanceof Date || right instanceof Date;
  if (isDatePair) {
    // A boolean or nullish operand can never be ordered against a Date.
    if (typeof left === 'boolean' || typeof right === 'boolean' || left == null || right == null) {
      return false;
    }
  }
  const leftValue = isDatePair ? new Date(toOrdinal(left)).getTime() : toOrdinal(left);
  const rightValue = isDatePair ? new Date(toOrdinal(right)).getTime() : toOrdinal(right);
  if (typeof leftValue === 'string' && typeof rightValue === 'string') {
    return compare(leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0);
  }
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
    return false;
  }
  return compare(leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0);
}

function looseEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    if (typeof left === 'boolean' || typeof right === 'boolean' || left == null || right == null) {
      return false;
    }
    return order(left, right, (result) => result === 0);
  }
  // eslint-disable-next-line eqeqeq
  return left == right;
}

function asText(value: unknown): string {
  if (value == null) {
    throw new Error('Cannot compare a null or undefined operand as text');
  }
  return String(value);
}

function contains(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === 'string') {
    return haystack.includes(asText(needle));
  }
  if (Array.isArray(haystack)) {
    return haystack.includes(needle);
  }
  throw new Error('The first operand of "includes" must be a string or an array');
}

function buildComparers(): Map<string, Comparer> {
  const comparers = new Map<string, Comparer>([
    ['equal', looseEqual],
    ['notEqual', (left, right) => !looseEqual(left, right)],
    ['gt', (left, right) => order(left, right, (result) => result > 0)],
    ['gte', (left, right) => order(left, right, (result) => result >= 0)],
    ['lt', (left, right) => order(left, right, (result) => result < 0)],
    ['lte', (left, right) => order(left, right, (result) => result <= 0)],
    ['includes', contains],
    ['notIncludes', (left, right) => !contains(left, right)],
    ['startsWith', (left, right) => asText(left).startsWith(asText(right))],
    ['notStartsWith', (left, right) => !asText(left).startsWith(asText(right))],
    ['endsWith', (left, right) => asText(left).endsWith(asText(right))],
    ['notEndsWith', (left, right) => !asText(left).endsWith(asText(right))],
  ]);
  for (const [alias, name] of [['==', 'equal'], ['!=', 'notEqual'], ['>', 'gt'], ['>=', 'gte'], ['<', 'lt'], ['<=', 'lte']]) {
    const comparer = comparers.get(name);
    if (comparer) {
      comparers.set(alias, comparer);
    }
  }
  return comparers;
}

const COMPARERS: Map<string, Comparer> = buildComparers();

export const CONDITION_COMPARATORS: readonly string[] = [...COMPARERS.keys()];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Evaluate a calculation tree whose leaves have already been resolved through
 * the workflow variable system, so every operand here is plain runtime data.
 */
export function evaluateConditionCalculation(calculation: unknown): boolean {
  if (calculation == null) {
    return true;
  }
  if (!isRecord(calculation)) {
    throw new Error('Condition calculation must be an object');
  }

  const group = calculation.group;
  if (group !== undefined) {
    if (!isRecord(group)) {
      throw new Error('Condition calculation group must be an object');
    }
    if (group.type !== 'and' && group.type !== 'or') {
      throw new Error('Condition calculation group type must be "and" or "or"');
    }
    const calculations = group.calculations;
    if (calculations === undefined) {
      return true;
    }
    if (!Array.isArray(calculations)) {
      throw new Error('Condition calculation group calculations must be an array');
    }
    return group.type === 'and'
      ? calculations.every((item) => evaluateConditionCalculation(item))
      : calculations.some((item) => evaluateConditionCalculation(item));
  }

  const { calculator, operands } = calculation;
  if (calculator == null || !Array.isArray(operands) || !operands.length) {
    return true;
  }
  if (typeof calculator !== 'string') {
    throw new Error('Condition calculator must be a string');
  }
  const comparer = COMPARERS.get(calculator);
  if (!comparer) {
    throw new Error(`No condition calculator registered for "${calculator}"`);
  }
  return Boolean(comparer(operands[0], operands[1]));
}

function validateCalculationShape(calculation: unknown, location: string): string | null {
  if (calculation == null) {
    return null;
  }
  if (!isRecord(calculation)) {
    return `${location} must be an object`;
  }
  const group = calculation.group;
  if (group !== undefined) {
    if (!isRecord(group)) {
      return `${location}.group must be an object`;
    }
    if (group.type !== 'and' && group.type !== 'or') {
      return `${location}.group.type must be "and" or "or"`;
    }
    if (group.calculations === undefined) {
      return null;
    }
    if (!Array.isArray(group.calculations)) {
      return `${location}.group.calculations must be an array`;
    }
    for (const [index, item] of group.calculations.entries()) {
      const error = validateCalculationShape(item, `${location}.group.calculations[${index}]`);
      if (error) {
        return error;
      }
    }
    return null;
  }
  if (
    calculation.calculator !== undefined
    && (typeof calculation.calculator !== 'string' || !COMPARERS.has(calculation.calculator))
  ) {
    return `${location}.calculator must be one of: ${CONDITION_COMPARATORS.join(', ')}`;
  }
  if (calculation.operands !== undefined && !Array.isArray(calculation.operands)) {
    return `${location}.operands must be an array`;
  }
  return null;
}

/** Hand-written config validation (D3: the first version has no schema library). */
export function validateConditionConfig(config: JsonObject): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(config)) {
    if (key !== 'calculation') {
      errors[key] = `condition config does not accept field "${key}"`;
    }
  }
  const calculationError = validateCalculationShape(config.calculation, 'calculation');
  if (calculationError) {
    errors.calculation = calculationError;
  }
  return Object.keys(errors).length ? errors : null;
}

function readConditionConfig(config: JsonObject): ConditionConfig {
  const errors = validateConditionConfig(config);
  if (errors) {
    throw new Error(`Invalid condition config: ${Object.values(errors).join('; ')}`);
  }
  return {
    ...(config.calculation == null ? {} : { calculation: config.calculation as ConditionCalculation }),
  };
}

/**
 * `condition` — the only branching node of the first version.
 *
 * A truthy calculation enters the `yes` branch and a falsy one enters the `no`
 * branch. A branch that is not declared falls through to the node's own
 * downstream, which is how an empty branch is expressed in the flat topology.
 */
export const conditionInstruction: WorkflowInstruction = {
  branching: true,

  async run(
    node: WorkflowNode,
    _input: WorkflowNodeRun | { result: unknown } | undefined,
    processor: Processor,
  ): Promise<WorkflowInstructionResult> {
    const config = readConditionConfig(node.config);
    const result = evaluateConditionCalculation(processor.getParsedValue(config.calculation, node.id));

    const branchKey = result ? CONDITION_BRANCH_KEYS.yes : CONDITION_BRANCH_KEYS.no;
    const branch = processor.getBranches(node).find((candidate) => candidate.branchKey === branchKey);
    // `nextKey` makes the processor persist this node's nodeRun first and then enter
    // the branch head with that nodeRun as input, so branch recall always has a
    // persisted parent nodeRun to come back to.
    return branch
      ? { status: NODE_RUN_STATUS.RESOLVED, result, nextKey: branch.key }
      : { status: NODE_RUN_STATUS.RESOLVED, result };
  },

  /**
   * Called by `Processor.end()` when the last node of a branch finished and the
   * branch parent has to decide what happens next.
   *
   * The v3 instruction protocol returns a payload instead of a mutable model,
   * so this recall appends a second nodeRun row for the condition node rather than
   * updating the one written by `run()`. The extra row records the moment
   * control came back from the branch; `nodeRunsMapByNodeKey` keeps the latest one.
   */
  async resume(
    node: WorkflowNode,
    input: WorkflowNodeRun | { result: unknown } | undefined,
    processor: Processor,
  ): Promise<WorkflowInstructionResult | null> {
    if (!input || !('status' in input)) {
      throw new Error(`Condition node "${node.key}" was resumed without a branch nodeRun`);
    }
    const branchNodeRun: WorkflowNodeRun = input;

    if (branchNodeRun.status === NODE_RUN_STATUS.PENDING) {
      // A node inside the branch is still waiting to be resumed. Returning
      // `null` stops here without touching the persisted execution status, so
      // the run stays STARTED until that node is dispatched again.
      return null;
    }

    if (branchNodeRun.status === NODE_RUN_STATUS.RESOLVED) {
      // Branch succeeded: restore this node's own result and continue downstream.
      const parentNodeRun = processor.findBranchParentNodeRun(branchNodeRun, node);
      return { status: NODE_RUN_STATUS.RESOLVED, result: parentNodeRun ? parentNodeRun.result : null };
    }

    // Bubble the rejected status up so an enclosing scope can decide about it.
    return { status: branchNodeRun.status, result: branchNodeRun.result };
  },
};

export default conditionInstruction;
