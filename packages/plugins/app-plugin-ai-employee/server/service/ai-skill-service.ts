import type { AIManager, SkillsEntity } from '@nocobase/ai-employee';
import {
  forbiddenError,
  type ManagedSkillDetail,
  type ManagedSkillList,
  type ManagedSkillSummary,
  type ManagedSkillTool,
  type SkillsManagementActor,
} from '../types.js';
import {
  asRecord,
  badRequest,
  normalizeScope,
  notFound,
  optionalString,
  requiredString,
  resourceI18n,
  stringArray,
} from './utils.js';

export interface AISkillServiceOptions {
  readonly ai: AIManager;
}

export class AISkillService {
  private readonly ai: AIManager;

  public constructor({ ai }: AISkillServiceOptions) {
    this.ai = ai;
  }
  async list(_options: {}): Promise<unknown[]> {
    // The employee editor consumes this sanitized list as read-only display
    // metadata. Management authorization remains required for get and mutations.
    return (await this.ai.skillsManager.listSkills({})).map(
      ({ content: _content, ...skill }: any) => skill,
    );
  }

  async listAll({
    actor,
  }: {
    actor: SkillsManagementActor;
  }): Promise<ManagedSkillList> {
    this.requireManagementAccess(actor);
    const skills = await this.ai.skillsManager.listSkills({});
    return {
      rows: await Promise.all(skills.map((skill) => this.summarize(skill))),
    };
  }

  async getDetails({
    actor,
    name,
  }: {
    actor: SkillsManagementActor;
    name: string;
  }): Promise<ManagedSkillDetail> {
    this.requireManagementAccess(actor);
    const key = requiredString(name, 'name');
    const skill = await this.ai.skillsManager.getSkills(key);
    if (!skill) throw notFound('aiSkills', key);
    return { ...(await this.summarize(skill)), content: skill.content };
  }

  private requireManagementAccess(actor: SkillsManagementActor): void {
    if (
      actor.id === 'anonymous' ||
      !String(actor.id).trim() ||
      actor.canReadAllSkills !== true
    ) {
      throw forbiddenError('AI settings access is required');
    }
  }

  private async summarize(skill: SkillsEntity): Promise<ManagedSkillSummary> {
    const tools = await Promise.all(
      [...new Set(skill.tools ?? [])].map(
        async (name): Promise<ManagedSkillTool> => {
          // Resolve exact associations using the registry's static-first lookup.
          const tool = await this.ai.toolsManager.getTools(name);
          return tool
            ? {
                name: tool.definition.name,
                ...(tool.i18n ? { i18n: tool.i18n } : {}),
                title: tool.introduction?.title || tool.definition.name,
                description: tool.definition.description,
                about: tool.introduction?.about ?? '',
                available: true,
              }
            : {
                name,
                title: name,
                description: '',
                about: '',
                available: false,
              };
        },
      ),
    );
    return {
      name: skill.name,
      ...(skill.i18n ? { i18n: skill.i18n } : {}),
      title: skill.introduction?.title || skill.name,
      description: skill.description,
      tools,
    };
  }

  async get({ name }: { name: string }): Promise<unknown> {
    const skill = await this.ai.skillsManager.getSkills(name);
    if (!skill) throw notFound('aiSkills', name);
    return skill;
  }

  async upsert({ input }: { input: unknown }): Promise<unknown> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const current = await this.ai.skillsManager.getSkills(name);
    const introduction = asRecord(record.introduction);
    await this.ai.skillsManager.registerSkills({
      name,
      scope: normalizeScope(record.scope ?? current?.scope),
      i18n: resourceI18n(record.i18n) ?? current?.i18n,
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
    return this.get({ name });
  }

  async delete({ name }: { name: string }): Promise<void> {
    await this.ai.skillsManager.deleteSkills(name);
  }
}
