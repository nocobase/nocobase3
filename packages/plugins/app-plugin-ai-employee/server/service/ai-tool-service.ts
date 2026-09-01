import type { Context } from '../context.js';
import type { ToolsEntity, ToolsOptions } from '@nocobase/ai-employee';
import {
  asRecord,
  badRequest,
  isSerializableObject,
  normalizeScope,
  notFound,
  optionalString,
  requiredString,
} from './utils.js';

export class AIToolService {
  async list(ctx: Context): Promise<unknown[]> {
    // The employee editor consumes this serialized list as read-only display
    // metadata. Management authorization remains required for get and mutations.
    return (await ctx.ai.toolsManager.listTools({})).map(serializeTool);
  }

  async get(ctx: Context, name: string): Promise<unknown> {
    const tool = await ctx.ai.toolsManager.getTools(name);
    if (!tool) throw notFound('aiTools', name);
    return serializeTool(tool);
  }

  async upsert(ctx: Context, input: unknown): Promise<unknown> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const definition = asRecord(record.definition) ?? record;
    const name = requiredString(
      definition.name ?? record.name,
      'definition.name',
    );
    const normalizedInput =
      definition.name || record.name
        ? record
        : record.definition
          ? { ...record, definition: { ...definition, name } }
          : { ...record, name };
    const current = await ctx.ai.toolsManager.getTools(name);
    await ctx.ai.toolsManager.registerTools(
      normalizeTool(normalizedInput, current),
    );
    return this.get(ctx, name);
  }

  async delete(ctx: Context, name: string): Promise<void> {
    await ctx.ai.toolsManager.unregisterTools(name);
  }
}

function normalizeTool(
  input: Record<string, unknown>,
  current?: ToolsEntity,
): ToolsOptions {
  const definition = asRecord(input.definition) ?? input;
  const name = requiredString(
    definition.name ?? input.name ?? current?.definition.name,
    'definition.name',
  );
  const execution =
    input.execution === 'frontend' || input.execution === 'backend'
      ? input.execution
      : (current?.execution ?? 'backend');
  const invoke =
    typeof input.invoke === 'function'
      ? (input.invoke as ToolsOptions['invoke'])
      : current?.invoke;
  if (!invoke && execution !== 'frontend') {
    throw badRequest(
      'Managed backend tools require an executable invoke function',
    );
  }
  return {
    scope: normalizeScope(input.scope ?? current?.scope),
    from:
      input.from === 'workflow' ||
      input.from === 'mcp' ||
      input.from === 'loader'
        ? input.from
        : (current?.from ?? 'loader'),
    execution,
    defaultPermission:
      input.defaultPermission === 'ALLOW' || input.defaultPermission === 'ASK'
        ? input.defaultPermission
        : (current?.defaultPermission ?? 'ASK'),
    silence:
      typeof input.silence === 'boolean'
        ? input.silence
        : (current?.silence ?? false),
    introduction: {
      title:
        optionalString(asRecord(input.introduction)?.title) ??
        current?.introduction?.title ??
        name,
      about:
        optionalString(asRecord(input.introduction)?.about) ??
        current?.introduction?.about,
    },
    definition: {
      name,
      description:
        optionalString(definition.description) ??
        current?.definition.description ??
        '',
      schema: definition.schema ?? current?.definition.schema,
    },
    invoke:
      invoke ??
      (async () => ({
        status: 'success' as const,
        content: 'Frontend tool call has been dispatched.',
      })),
  };
}

function serializeTool(tool: ToolsEntity): Record<string, unknown> {
  const { invoke: _invoke, ...safe } = tool;
  return {
    ...safe,
    definition: {
      ...safe.definition,
      schema: isSerializableObject(safe.definition.schema)
        ? safe.definition.schema
        : undefined,
    },
  };
}
