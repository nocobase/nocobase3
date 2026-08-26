import { Outlet } from 'react-router';

import {
  NocoBasePluginPrerequisiteGate,
  type NocoBasePluginRequirement,
} from '../components/index.js';
import { useT } from '../locales/index.js';

const knowledgeBasePluginRequirements: NocoBasePluginRequirement[] = [
  {
    name: 'ai-knowledge-base',
    packageName: '@nocobase/plugin-ai-knowledge-base',
    label: 'AI Knowledge Base',
    probe: {
      resource: 'aiKnowledgeBase',
      action: 'list',
      query: { page: 1, pageSize: 1 },
    },
  },
];

export default function KnowledgeBasePluginPrerequisiteRoute() {
  const t = useT();

  return (
    <NocoBasePluginPrerequisiteGate
      requirements={knowledgeBasePluginRequirements}
      messages={{
        unavailableTitle: t('Knowledge base plugin is not enabled'),
        unavailableDescription: t(
          'Enable the AI Knowledge Base plugin to use the Knowledge base workspace. Contact your system administrator, then try again.',
        ),
        errorTitle: t('Unable to check the knowledge base plugin'),
        errorDescription: t(
          'The plugin status could not be loaded. Check the connection and try again.',
        ),
        retryLabel: t('Try again'),
      }}
    >
      <Outlet />
    </NocoBasePluginPrerequisiteGate>
  );
}
