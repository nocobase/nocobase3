import { useAppClient } from '@nocobase/app-client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { getAppSettingsConfiguration } from '../configuration.js';
import { AppSettingsModuleContent } from '../module-content.js';
import { getOrCreateAppSettingsModuleRegistry } from '../registry.js';
import { AppSettingsWorkspace } from '../settings-workspace.js';

export default function SettingsModulePage(): ReactElement {
  const client = useAppClient();
  const configuration = getAppSettingsConfiguration(client);
  const { moduleId } = useParams();
  const registry = getOrCreateAppSettingsModuleRegistry(client);
  const modules = registry.list();
  const module = moduleId ? registry.get(moduleId) : undefined;

  return (
    <AppSettingsWorkspace {...configuration} modules={modules}>
      <AppSettingsModuleContent
        basePath={configuration.basePath}
        module={module}
      />
    </AppSettingsWorkspace>
  );
}
