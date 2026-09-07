import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { LLMProvider } from '@nocobase/ai-employee';

export const auditSentinel = 'AGENT_MODEL_PROMPT_ARGS_OUTPUT_SENTINEL';
/** Only the external model is substituted; LangChain, tools and repositories execute normally. */
export class AuditModel extends BaseChatModel {
  async *_streamResponseChunks(
    messages: BaseMessage[],
  ): AsyncGenerator<ChatGenerationChunk> {
    const result = await this._generate(messages);
    const message = result.generations[0].message;
    if (!(message instanceof AIMessage)) throw new Error('Expected AI message');
    yield new ChatGenerationChunk({
      text: '',
      message: new AIMessageChunk({
        content: message.content,
        tool_call_chunks: message.tool_calls?.map((call, index) => ({
          id: call.id,
          name: call.name,
          args: JSON.stringify(call.args),
          index,
          type: 'tool_call_chunk',
        })),
      }),
    });
  }
  _llmType(): string {
    return 'audit-deterministic';
  }
  bindTools(): this {
    return this;
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const completed = messages.filter(
      (message) => message.type === 'tool',
    ).length;
    const message =
      completed < 2
        ? new AIMessage({
            content: '',
            tool_calls: [
              {
                id: globalThis.crypto.randomUUID(),
                name: 'auditTestTool',
                args: { value: auditSentinel },
                type: 'tool_call',
              },
            ],
          })
        : new AIMessage(auditSentinel);
    return { generations: [{ text: '', message }] };
  }
}
export class AuditModelProvider extends LLMProvider {
  createModel(): AuditModel {
    return new AuditModel({});
  }
}
