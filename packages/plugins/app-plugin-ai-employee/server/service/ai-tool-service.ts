import type { AIManager } from '@nocobase/ai-employee';
import type { ToolsEntity, ToolsOptions } from '@nocobase/ai-employee';
import {
  forbiddenError,
  type ManagedToolDetail,
  type ManagedToolList,
  type ManagedToolSummary,
  type ToolsManagementActor,
} from '../types.js';
import { serializeToolInputSchema } from './tool-input-schema.js';
import {
  asRecord,
  badRequest,
  isSerializableObject,
  normalizeScope,
  notFound,
  optionalString,
  requiredString,
  resourceI18n,
} from './utils.js';

export interface AIToolServiceOptions {
  readonly ai: AIManager;
}

export class AIToolService {
  private readonly ai: AIManager;

  public constructor({ ai }: AIToolServiceOptions) {
    this.ai = ai;
  }
  async listAll({
    actor,
  }: {
    actor: ToolsManagementActor;
  }): Promise<ManagedToolList> {
    this.requireManagementAccess(actor);
    const tools = await this.ai.toolsManager.listTools({});
    const resolved = new Map<string, ManagedToolSummary>();
    for (const tool of tools) {
      // The manager lists static entries first, matching its static-first lookup.
      if (!resolved.has(tool.definition.name)) {
        resolved.set(tool.definition.name, summarizeTool(tool));
      }
    }
    return { rows: [...resolved.values()] };
  }

  async getDetails({
    actor,
    name,
  }: {
    actor: ToolsManagementActor;
    name: string;
  }): Promise<ManagedToolDetail> {
    this.requireManagementAccess(actor);
    const key = requiredString(name, 'name');
    const tool = await this.ai.toolsManager.getTools(key);
    if (!tool) throw notFound('aiTools', key);
    return {
      ...summarizeTool(tool),
      inputSchema: serializeToolInputSchema(tool.definition.schema),
    };
  }

  private requireManagementAccess(actor: ToolsManagementActor): void {
    if (
      actor.id === 'anonymous' ||
      !String(actor.id).trim() ||
      actor.canReadAllTools !== true
    ) {
      throw forbiddenError('AI settings access is required');
    }
  }

  async list(_options: {}): Promise<unknown[]> {
    // The employee editor consumes this serialized list as read-only display
    // metadata. Management authorization remains required for get and mutations.
    return (await this.ai.toolsManager.listTools({})).map(serializeTool);
  }

  async get({ name }: { name: string }): Promise<unknown> {
    const tool = await this.ai.toolsManager.getTools(name);
    if (!tool) throw notFound('aiTools', name);
    return serializeTool(tool);
  }

  async upsert({ input }: { input: unknown }): Promise<unknown> {
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
    const current = await this.ai.toolsManager.getTools(name);
    await this.ai.toolsManager.registerTools(
      normalizeTool(normalizedInput, current),
    );
    return this.get({ name });
  }

  async delete({ name }: { name: string }): Promise<void> {
    await this.ai.toolsManager.unregisterTools(name);
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
    i18n: resourceI18n(input.i18n) ?? current?.i18n,
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

function summarizeTool(tool: ToolsEntity): ManagedToolSummary {
  return {
    name: tool.definition.name,
    ...(tool.i18n ? { i18n: tool.i18n } : {}),
    title: tool.introduction?.title || tool.definition.name,
    description: tool.definition.description,
    about: tool.introduction?.about ?? '',
    scope: tool.scope,
    source: tool.from ?? '',
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
