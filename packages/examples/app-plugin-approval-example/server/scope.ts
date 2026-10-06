/** The plugin's package name: its jobs scope and its log name. */
export const APPROVAL_EXAMPLE_SCOPE: string =
  '@nocobase/app-plugin-approval-example';

/** The collections of the example's own that are not a scenario's. */
export const APPROVAL_EXAMPLE_COLLECTIONS: {
  readonly transitions: 'approvalExampleTransitions';
  readonly effectRuns: 'approvalExampleEffectRuns';
  readonly messages: 'approvalExampleMessages';
  readonly operations: 'approvalExampleOperations';
  readonly settings: 'approvalExampleSettings';
} = Object.freeze({
  transitions: 'approvalExampleTransitions',
  effectRuns: 'approvalExampleEffectRuns',
  messages: 'approvalExampleMessages',
  operations: 'approvalExampleOperations',
  settings: 'approvalExampleSettings',
});
