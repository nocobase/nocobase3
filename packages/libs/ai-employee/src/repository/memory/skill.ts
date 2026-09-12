import type {
  SkillsEntity,
  SkillsQuery,
  SkillsRepository,
} from '../ai-skill.js';

/** Skills are loaded resources owned by one App process and are not business database records. */
export class MemorySkillsRepository implements SkillsRepository {
  private readonly skills = new Map<string, SkillsEntity>();

  async getSkills(name: string): Promise<SkillsEntity | undefined> {
    return this.skills.get(name);
  }

  async listSkills(query: SkillsQuery = {}): Promise<SkillsEntity[]> {
    return [...this.skills.values()]
      .filter((skill) => {
        if (query.scope && skill.scope !== query.scope) return false;
        if (query.name && !skill.name.includes(query.name)) return false;
        return true;
      })
      .sort(
        (left, right) =>
          (left.sort ?? 0) - (right.sort ?? 0) ||
          left.name.localeCompare(right.name),
      );
  }

  async createOrUpdateSkills(input: {
    value: SkillsEntity;
  }): Promise<{ value: SkillsEntity; replaced: boolean }> {
    const replaced = this.skills.has(input.value.name);
    this.skills.set(input.value.name, input.value);
    return { value: input.value, replaced };
  }

  async deleteSkills(name: string): Promise<void> {
    this.skills.delete(name);
  }
}
