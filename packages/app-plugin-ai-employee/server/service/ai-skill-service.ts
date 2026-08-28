import type { Context } from '../context.js';
import {
  asRecord,
  badRequest,
  normalizeScope,
  notFound,
  optionalString,
  requiredString,
  stringArray,
} from './utils.js';

export class AISkillService {
  async list(ctx: Context): Promise<unknown[]> {
    // The employee editor consumes this sanitized list as read-only display
    // metadata. Management authorization remains required for get and mutations.
    return (await ctx.ai.skillsManager.listSkills({})).map(
      ({ content: _content, ...skill }: any) => skill,
    );
  }

  async get(ctx: Context, name: string): Promise<unknown> {
    const skill = await ctx.ai.skillsManager.getSkills(name);
    if (!skill) throw notFound('aiSkills', name);
    return skill;
  }

  async upsert(ctx: Context, input: unknown): Promise<unknown> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
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
    return this.get(ctx, name);
  }

  async delete(ctx: Context, name: string): Promise<void> {
    await ctx.ai.skillsManager.deleteSkills(name);
  }
}
