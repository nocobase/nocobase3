export * from './constants.js';
export { default as Dispatcher } from './dispatcher.js';
export type { DispatcherOptions } from './dispatcher.js';
export { default as Processor } from './processor.js';
export type { BackgroundAbortHandle, ProcessorOptions, ProcessorRunOptions } from './processor.js';
export {
  default as WorkflowSourceLoader,
  WorkflowSourceConflictError,
  WorkflowSourceError,
} from './source-loader.js';
export type {
  WorkflowSourceLoaderOptions,
  WorkflowSourceLoadResult,
} from './source-loader.js';
export { checkWorkflowPackage, coreWorkflowSourceContracts } from './source-check.js';
export type { WorkflowSourceCheckOptions, WorkflowSourceCheckResult } from './source-check.js';
export { formatWorkflowSourceIssue, WorkflowSourceCheckError } from './source-issues.js';
export type { WorkflowSourceIssue, WorkflowSourcePhase } from './source-issues.js';
export { compileWorkflowSource, validateWorkflowFlatIrTopology } from './source-compiler.js';
export { activateWorkflowSource, materializeWorkflowSource } from './source-materializer.js';
export type { MaterializedWorkflowSource, WorkflowSourceMaterializeResult } from './source-materializer.js';
export { parseWorkflowSource, typecheckWorkflowSource } from './source-parser.js';
export type { ParsedWorkflowSource } from './source-parser.js';
export { validateWorkflowSourceAst } from './source-validator.js';
export type {
  WorkflowNodeSourceContract,
  WorkflowSourceContracts,
  WorkflowSourceRuntimeContracts,
} from './source-validator.js';
export * from './node-results.js';
export * from './types.js';
export { loadNodeRun, loadRun, loadWorkflow } from './utils.js';
export * from './value-resolver.js';
export * from './workflow-inputs.js';
export * from './invocation-contract.js';
export * from './package-scanner.js';
export * from './artifact-builder.js';
export * from './artifact-store.js';
export * from './publisher.js';
export * from './run-entry-builder.js';
export * from './artifact-resolver.js';
export * from './run-inspector.js';

// --- M1 Wave 1 ---
export { coreInstructions, INSTRUCTION_TYPES, RunInstruction } from './instructions/index.js';
export type { InstructionType } from './instructions/index.js';
export {
  CONDITION_BRANCH_KEYS,
  ConditionInstruction,
  validateConditionConfig,
} from './instructions/index.js';
export type {
  ConditionBranchKey,
  ConditionConfig,
} from './instructions/index.js';
export * from './expressions/index.js';
export {
  assertWorkflowRunResult,
  createRunInstruction,
  RunInstruction as BaseRunInstruction,
  validateRunConfig,
} from './instructions/run.js';
export type {
  RunConfig,
  RunInstructionOptions,
  WorkflowRunArgs,
  WorkflowRunFunction,
  WorkflowRunJsonValue,
  WorkflowRunModule,
  WorkflowRunModuleRequest,
  WorkflowRunModuleResolver,
  WorkflowRunRuntime,
} from './instructions/run.js';
export {
  createSourceDirResolver,
  unboundRunModuleResolver,
  WorkflowRunModuleError,
} from './run-module-resolver.js';
export type { SourceDirResolverOptions } from './run-module-resolver.js';
export {
  createWorkflowQueueAdapter,
  publishWorkflowTask,
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_TASK_JOB_NAME,
  WorkflowTaskJob,
} from './queue-adapter.js';
export type {
  PublishWorkflowTaskOptions,
  WorkflowQueueAdapter,
  WorkflowQueueAdapterOptions,
  WorkflowQueueDelay,
  WorkflowTaskDispatch,
} from './queue-adapter.js';
export { createTimeoutReaper } from './timeout-reaper.js';
export type { TimeoutReaper, TimeoutReaperOptions } from './timeout-reaper.js';

// --- M1 Wave 2 (T5) ---
export { default as WorkflowRuntime } from './runtime.js';
