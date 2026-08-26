import type { AIEmployeeEntity } from '../../app/repository/index.js';
import type { RuntimeActor } from '../../index.js';
import type { Context } from '../context.js';
import type { AIEmployeeDto } from '../api/contracts.js';
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

function localizeBuiltInInfo(ctx: Context, employee: AIEmployeeEntity): void {
  if (!employee.builtIn) {
    return;
  }
  const options = { ns: ctx.i18nNamespace };
  employee.nickname = ctx.t(employee.nickname ?? '', options);
  employee.position = ctx.t(employee.position ?? '', options);
  employee.bio = ctx.t(employee.bio ?? '', options);
  employee.greeting = ctx.t(employee.greeting ?? '', options);
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
      localizeBuiltInInfo(ctx, row);
      const skillSettings: any = row.skillSettings ?? { skills: [], tools: [] };
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
        username: row.username,
        nickname: row.nickname,
        position: row.position,
        avatar: row.avatar,
        bio: row.bio,
        greeting: row.greeting,
        userConfig: {
          prompt: userConfigs.get(row.username)?.prompt,
        },
        skillSettings,
        chatSettings: row.chatSettings,
        modelSettings: row.modelSettings,
        builtIn: row.builtIn,
        category: row.category,
        deprecated: row.deprecated,
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
    return ctx.repositories.aiEmployees.find({});
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
    return employee;
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
    const currentRecord = current ?? {};
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
