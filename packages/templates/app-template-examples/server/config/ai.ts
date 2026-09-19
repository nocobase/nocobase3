import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AIApplicationConfig } from '@nocobase/app-plugin-ai-employee/server/config';

const ai: AppConfigFactory<AIApplicationConfig> = defineAppConfig(
  (_runtime) => ({
    storage: {},
    aiEmployee: { storage: {} },
    aiKnowledgeBase: {
      storage: {},
      vectorDatabases: [],
      manifests: [],
    },
    llmServices: [],
    skills: { paths: [] },
    mcpServers: {},
  }),
);

export default ai;
