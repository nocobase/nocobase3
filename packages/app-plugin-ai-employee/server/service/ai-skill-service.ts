import type { Context } from '../context.js';
import type { RuntimeActor } from '@nocobase/ai-employee';
import type { AIEmployeeAccessPolicy } from '../auth/access-policy.js';
import {
  asRecord,
  assertCanManage,
  badRequest,
  normalizeScope,
  notFound,
  optionalString,
  requiredString,
  stringArray,
  unwrapRecord,
} from './resource-management-utils.js';

export class AISkillService {
  constructor(private readonly accessPolicy: AIEmployeeAccessPolicy) {}

  async list(ctx: Context, actor: RuntimeActor): Promise<unknown[]> {
    assertCanManage(this.accessPolicy, actor);
    return (await ctx.ai.skillsManager.listSkills({})).map(
      ({ content: _content, ...skill }: any) => skill,
    );
  }

  async get(ctx: Context, actor: RuntimeActor, name: string): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const skill = await ctx.ai.skillsManager.getSkills(name);
    if (!skill) throw notFound('aiSkills', name);
    return skill;
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
    const name = requiredString(record.name ?? keyHint, 'name');
    const current = await ctx.ai.skillsManager.getSkills(name);
    const introduction = asRecord(record.introduction);
    await ctx.ai.skillsManager.registerSkills({
      name,
      scope: normalizeScope(record.scope ?? current?.scope),
      description:
        optionalString(record.description) ?? current?.description ?? '',
      content:
        typeof record.content === 'string'
          ? record.content
          : (current?.content ?? ''),
      tools: stringArray(record.tools) ?? current?.tools ?? [],
      from: optionalString(record.from) ?? current?.from ?? 'loader',
      introduction: {
        title:
          optionalString(introduction?.title ?? record.title) ??
          current?.introduction?.title ??
          name,
        about:
          optionalString(introduction?.about ?? record.about) ??
          current?.introduction?.about,
      },
    });
    return this.get(ctx, actor, name);
  }

  async delete(ctx: Context, actor: RuntimeActor, name: string): Promise<void> {
    assertCanManage(this.accessPolicy, actor);
    await ctx.ai.skillsManager.deleteSkills(name);
  }
}
