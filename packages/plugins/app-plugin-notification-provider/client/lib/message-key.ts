// Translate stored undo status at render time so language changes remain live.
// Unknown text keeps its original fallback.
const messageKeys = new Map<string, string>([
  ['No undo requested.', 'undoIdle'],
  ['Waiting for an undo request.', 'undoPending'],
  ['Undo requested.', 'undoRequested'],
]);

export function messageKey(message: string): string {
  return messageKeys.get(message) ?? message;
}
