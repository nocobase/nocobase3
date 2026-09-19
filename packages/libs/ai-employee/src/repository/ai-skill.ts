export type SkillsScope = 'SPECIFIED' | 'GENERAL' | 'CUSTOM';

export type SkillsEntity = {
  scope: SkillsScope;
  name: string;
  description: string;
  content: string;
  tools?: string[];
  /** UI translation metadata, independent of associated tools. */
  i18n?: { namespace: string };
  introduction?: { title: string; about?: string };
  from?: string;
  sort?: number;
};

export type SkillsQuery = {
  scope?: SkillsScope;
  name?: string;
};

export interface SkillsRepository {
  getSkills(name: string): Promise<SkillsEntity | undefined>;
  listSkills(query?: SkillsQuery): Promise<SkillsEntity[]>;
  createOrUpdateSkills(input: {
    value: SkillsEntity;
  }): Promise<{ value: SkillsEntity; replaced: boolean }>;
  deleteSkills(name: string): Promise<void>;
}
