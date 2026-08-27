import type { CollectionRepository } from './collection.js';

export type AIEmployeeToolSetting = {
  name: string;
  autoCall?: boolean;
};

export type AIEmployeeKnowledgeBase = {
  topK?: number;
  score?: string;
  knowledgeBaseKeys?: string[];
  retrievalStrategy?: 'always' | 'onDemand';
};

export type AIEmployeeEntity = {
  username: string;
  category?: string;
  description?: string;
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  about?: string | null;
  defaultPrompt?: string | null;
  skillSettings: {
    skills: string[];
    tools: AIEmployeeToolSetting[];
  };
  chatSettings?: {
    systemPromptMode?: 'default' | 'raw' | 'none';
    enableSkills?: boolean;
    enableTools?: boolean;
    [key: string]: unknown;
  };
  enabled?: boolean;
  builtIn?: boolean;
  deprecated?: boolean;
  enableKnowledgeBase?: boolean;
  knowledgeBase?: AIEmployeeKnowledgeBase;
  knowledgeBasePrompt?: string;
  modelSettings?: Record<string, unknown>;
  roles?: Array<{ name: string }>;
  sort?: number;
};

export interface AIEmployeeRepository extends CollectionRepository<AIEmployeeEntity> {}
