import { registerAISettingsTabs } from '@nocobase/app-plugin-ai-employee/client/ai-settings';

registerAISettingsTabs([
  {
    key: 'knowledge-base',
    labelKey: 'Knowledge Base',
    pageLoader: () =>
      import('./settings-pages.js').then(
        ({ KnowledgeBaseSettingsPage: defaultExport }) => ({
          default: defaultExport,
        }),
      ),
  },
  {
    key: 'vector-database',
    labelKey: 'Vector Database',
    pageLoader: () =>
      import('./settings-pages.js').then(
        ({ VectorDatabaseSettingsPage: defaultExport }) => ({
          default: defaultExport,
        }),
      ),
  },
]);
