import type { Context } from '../context.js';
import { EEFeatures } from '@nocobase/ai-employee';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { RuntimeActor } from '@nocobase/ai-employee';
import type { AIEmployeeDto } from '../routes/contracts.js';
import type { AIEmployeeAccessPolicy } from '../auth/access-policy.js';
import {
  asRecord,
  assertCanManage,
  badRequest,
  notFound,
  optionalString,
  requiredString,
  unwrapRecord,
} from './resource-management-utils.js';

type AIEmployeeRecord = Omit<
  AIEmployeeEntity,
  'knowledgeBase' | 'knowledgeBasePrompt'
> & {
  knowledgeBase?: unknown;
  knowledgeBasePrompt?: string | null;
  missingKnowledgeBaseKeys?: string[];
  [key: string]: any;
};

function cloneEmployee(employee: AIEmployeeEntity): AIEmployeeRecord {
  const record = employee as AIEmployeeRecord;
  const skillSettings = asRecord(record.skillSettings);
  const knowledgeBase = asRecord(record.knowledgeBase);
  return {
    ...record,
    ...(skillSettings
      ? {
          skillSettings: {
            ...skillSettings,
            skills: Array.isArray(skillSettings.skills)
              ? [...skillSettings.skills]
              : skillSettings.skills,
            tools: Array.isArray(skillSettings.tools)
              ? skillSettings.tools.map((tool) =>
                  asRecord(tool) ? { ...tool } : tool,
                )
              : skillSettings.tools,
          },
        }
      : {}),
    ...(knowledgeBase
      ? {
          knowledgeBase: {
            ...knowledgeBase,
            knowledgeBaseKeys: Array.isArray(knowledgeBase.knowledgeBaseKeys)
              ? [...knowledgeBase.knowledgeBaseKeys]
              : knowledgeBase.knowledgeBaseKeys,
          },
        }
      : {}),
  };
}

function localizeBuiltInInfo(ctx: Context, employee: AIEmployeeRecord): void {
  if (!employee.builtIn || !ctx.t) {
    return;
  }
  const options = { ns: ctx.i18nNamespace };
  employee.nickname = ctx.t(employee.nickname ?? '', options);
  employee.position = ctx.t(employee.position ?? '', options);
  employee.bio = ctx.t(employee.bio ?? '', options);
  employee.greeting = ctx.t(employee.greeting ?? '', options);
}

function serializeEmployee(
  ctx: Context,
  employee: AIEmployeeEntity,
): AIEmployeeRecord {
  const serialized = cloneEmployee(employee);
  localizeBuiltInInfo(ctx, serialized);
  return serialized;
}
function hasOwn(record: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getEditableField(
  record: Record<string, any>,
  profile: Record<string, any>,
  key: string,
  current: AIEmployeeEntity | null,
): unknown {
  if (hasOwn(profile, key)) return profile[key];
  if (profile !== record && hasOwn(record, key)) return record[key];
  return current?.[key as keyof AIEmployeeEntity];
}

function getStringOrNullField(
  record: Record<string, any>,
  profile: Record<string, any>,
  key: string,
  current: AIEmployeeEntity | null,
): string | null | undefined {
  const value = getEditableField(record, profile, key, current);
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
}

function getBooleanField(
  record: Record<string, any>,
  profile: Record<string, any>,
  key: string,
  current: AIEmployeeEntity | null,
  fallback: boolean,
): boolean {
  const value = getEditableField(record, profile, key, current);
  return typeof value === 'boolean' ? value : fallback;
}

function getJsonField(
  record: Record<string, any>,
  profile: Record<string, any>,
  key: string,
  current: AIEmployeeEntity | null,
): unknown {
  const value = getEditableField(record, profile, key, current);
  return value === undefined ? current?.[key as keyof AIEmployeeEntity] : value;
}

function getStringField(
  record: Record<string, any>,
  profile: Record<string, any>,
  key: string,
  current: AIEmployeeEntity | null,
): string | undefined {
  const value = getEditableField(record, profile, key, current);
  return typeof value === 'string' ? value : undefined;
}

function getKnowledgeBaseKeys(employee: AIEmployeeRecord): string[] {
  const knowledgeBase = asRecord(employee.knowledgeBase);
  if (!Array.isArray(knowledgeBase?.knowledgeBaseKeys)) {
    return [];
  }
  return knowledgeBase.knowledgeBaseKeys.filter(
    (key): key is string => typeof key === 'string',
  );
}

async function enrichMissingKnowledgeBaseKeys(
  ctx: Context,
  employees: AIEmployeeRecord[],
): Promise<void> {
  if (!ctx.ai.features.isFeaturesEnabled([EEFeatures.knowledgeBase])) {
    return;
  }
  const knowledgeBaseKeys = [
    ...new Set(employees.flatMap(getKnowledgeBaseKeys)),
  ];
  const knowledgeBases = knowledgeBaseKeys.length
    ? await ctx.ai.features.knowledgeBase.getKnowledgeBase(knowledgeBaseKeys)
    : [];
  const existingKeys = new Set(
    knowledgeBases.map((knowledgeBase) => knowledgeBase.key),
  );
  for (const employee of employees) {
    employee.missingKnowledgeBaseKeys = getKnowledgeBaseKeys(employee).filter(
      (key) => !existingKeys.has(key),
    );
  }
}

/**
 * `aiEmployees` service for AI employee resource management
 * (`listByUser`, `updateUserPrompt`) operating on plain repository entities.
 */
export class AIEmployeeService {
  constructor(
    private readonly accessPolicy: AIEmployeeAccessPolicy,
    private readonly options?: { knownRoles?: string[] },
  ) {}

  get knownRoles(): string[] {
    if (this.options?.knownRoles?.length) return this.options.knownRoles;
    const env = process.env.AI_DEFAULT_ROLES ?? '';
    const fromEnv = env
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return fromEnv.length ? fromEnv : ['admin', 'member', 'root'];
  }

  async listByUser(ctx: Context): Promise<AIEmployeeDto[]> {
    const skills = await ctx.ai.skillsManager.listSkills({
      scope: 'GENERAL' as any,
    });
    const tools = await ctx.ai.toolsManager.listTools({
      scope: 'GENERAL' as any,
    });
    const userId = ctx.currentUser.id;
    const where: Record<string, any> = { enabled: true };

    const rows = await ctx.repositories.aiEmployees.find({ filter: where });
    const userConfigs =
      userId == null
        ? new Map()
        : new Map(
            (
              await ctx.repositories.usersAiEmployees.find({
                filter: { userId },
              })
            ).map((config: any) => [config.aiEmployee, config]),
          );
    const sortedRows = rows.sort((a, b) => {
      const sa = userConfigs.get(a.username)?.sort ?? a.sort ?? 0;
      const sb = userConfigs.get(b.username)?.sort ?? b.sort ?? 0;
      return sa - sb;
    });

    return sortedRows.map((row) => {
      const serialized = serializeEmployee(ctx, row);
      const skillSettings: any = serialized.skillSettings ?? {
        skills: [],
        tools: [],
      };
      if (!Array.isArray(skillSettings.skills)) skillSettings.skills = [];
      if (!Array.isArray(skillSettings.tools)) skillSettings.tools = [];
      for (const tool of tools) {
        skillSettings.tools.push({
          name: tool.definition.name,
          autoCall: tool.defaultPermission === 'ALLOW',
        });
      }
      for (const skill of skills) skillSettings.skills.push(skill.name);
      return {
        username: serialized.username,
        nickname: serialized.nickname,
        position: serialized.position,
        avatar: serialized.avatar,
        bio: serialized.bio,
        greeting: serialized.greeting,
        description: serialized.description,
        userConfig: {
          prompt: userConfigs.get(serialized.username)?.prompt,
        },
        skillSettings,
        chatSettings: serialized.chatSettings,
        modelSettings: serialized.modelSettings,
        builtIn: serialized.builtIn,
        category: serialized.category,
        deprecated: serialized.deprecated,
      };
    });
  }

  async updateUserPrompt(
    ctx: Context,
    aiEmployee: string,
    prompt: string,
  ): Promise<void> {
    if (!aiEmployee) return ctx.throw(400);
    const userId = ctx.currentUser.id;
    const repo = ctx.repositories.usersAiEmployees;
    await ctx.database.transaction(async (connection) => {
      const record = await repo.findOne(
        { filter: { userId, aiEmployee } },
        { connection },
      );
      if (record) {
        await repo.update(
          { filter: { userId, aiEmployee }, values: { prompt } },
          { connection },
        );
        return;
      }
      await repo.create(
        { values: { aiEmployee, userId, prompt, sort: null } },
        { connection },
      );
    });
  }

  getTemplates(_ctx: Context): Array<Record<string, unknown>> {
    return [];
  }

  async list(ctx: Context, actor: RuntimeActor): Promise<unknown[]> {
    assertCanManage(this.accessPolicy, actor);
    const employees = (await ctx.repositories.aiEmployees.find({})).map(
      (employee) => serializeEmployee(ctx, employee),
    );
    await enrichMissingKnowledgeBaseKeys(ctx, employees);
    return employees;
  }

  async get(
    ctx: Context,
    actor: RuntimeActor,
    username: string,
  ): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const employee = await ctx.repositories.aiEmployees.findOne({
      filter: { username },
    });
    if (!employee) throw notFound('aiEmployees', username);
    const serialized = serializeEmployee(ctx, employee);
    await enrichMissingKnowledgeBaseKeys(ctx, [serialized]);
    return serialized;
  }

  async upsert(
    ctx: Context,
    actor: RuntimeActor,
    input: unknown,
    keyHint?: string,
  ): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const record = unwrapRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const username = requiredString(record.username ?? keyHint, 'username');
    const current = await ctx.repositories.aiEmployees.findOne({
      filter: { username },
    });
    const currentRecord = (current ?? {}) as AIEmployeeRecord;
    const profile = asRecord(record.profile) ?? record;
    const values: AIEmployeeEntity = {
      ...currentRecord,
      username,
      category:
        optionalString(record.category) ?? current?.category ?? 'business',
      nickname:
        optionalString(profile.nickname) ?? current?.nickname ?? username,
      position: optionalString(profile.position) ?? current?.position,
      avatar: optionalString(profile.avatar) ?? current?.avatar,
      bio: optionalString(profile.bio) ?? current?.bio,
      greeting: optionalString(profile.greeting) ?? current?.greeting,
      description:
        optionalString(profile.description ?? record.description) ??
        current?.description,
      defaultPrompt:
        typeof record.defaultPrompt === 'string' ||
        record.defaultPrompt === null
          ? record.defaultPrompt
          : (current?.defaultPrompt ?? null),
      about: getStringOrNullField(record, profile, 'about', current),
      knowledgeBasePrompt: getStringField(
        record,
        profile,
        'knowledgeBasePrompt',
        current,
      ),
      knowledgeBase: getJsonField(record, profile, 'knowledgeBase', current) as
        AIEmployeeEntity['knowledgeBase'] | undefined,
      enableKnowledgeBase: getBooleanField(
        record,
        profile,
        'enableKnowledgeBase',
        current,
        false,
      ),
      chatSettings: asRecord(record.chatSettings) ?? current?.chatSettings,
      skillSettings:
        (asRecord(record.skillSettings) as any) ?? current?.skillSettings,
      modelSettings: asRecord(record.modelSettings) ?? current?.modelSettings,
      enabled:
        typeof record.enabled === 'boolean'
          ? record.enabled
          : (current?.enabled ?? true),
      builtIn:
        typeof record.builtIn === 'boolean'
          ? record.builtIn
          : (current?.builtIn ?? false),
      deprecated:
        typeof record.deprecated === 'boolean'
          ? record.deprecated
          : (current?.deprecated ?? false),
      sort: typeof record.sort === 'number' ? record.sort : current?.sort,
    };
    await ctx.database.transaction(async (connection) => {
      if (current) {
        await ctx.repositories.aiEmployees.update(
          { filter: { username }, values },
          { connection },
        );
      } else {
        await ctx.repositories.aiEmployees.create({ values }, { connection });
      }
    });
    return this.get(ctx, actor, username);
  }

  async delete(
    ctx: Context,
    actor: RuntimeActor,
    username: string,
  ): Promise<void> {
    assertCanManage(this.accessPolicy, actor);
    await ctx.database.transaction(async (connection) => {
      await ctx.repositories.aiEmployees.destroy(
        { filter: { username } },
        { connection },
      );
    });
  }
}
