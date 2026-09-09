import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = path.resolve(import.meta.dirname, '../server');
const read = (relative: string): string =>
  fs.readFileSync(path.join(serverRoot, relative), 'utf8');

describe('AI employee conversation message persistence boundary', () => {
  it('owns assistant tool-call initialization in a dedicated message store', () => {
    const source = read('agent/ai-employee/conversation-message-store.ts');

    expect(source).toContain('class AIEmployeeConversationMessageStore');
    expect(source).toContain('saved.toolCalls ?? []');
    expect(source).toContain('{ connection: transaction }');
  });

  it('owns tool-message confirmation in the same message store transaction', () => {
    const source = read('agent/ai-employee/conversation-message-store.ts');

    expect(source).toContain('Tool message requires metadata.toolCallId');
    expect(source).toContain("values: { invokeStatus: 'confirmed' }");
    expect(source).toContain('toolCallId: { $in: toolCallIds }');
  });
});
