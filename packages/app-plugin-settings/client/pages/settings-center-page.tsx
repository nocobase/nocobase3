import { useAppClient } from '@nocobase/app-client';
import type { ReactElement } from 'react';

import { getAppSettingsConfiguration } from '../configuration.js';
import { AppSettingsCenter } from '../settings-center.js';
import { getOrCreateAppSettingsModuleRegistry } from '../registry.js';
import { AppSettingsWorkspace } from '../settings-workspace.js';

export default function SettingsCenterPage(): ReactElement {
  const client = useAppClient();
  const configuration = getAppSettingsConfiguration(client);
  const modules = getOrCreateAppSettingsModuleRegistry(client).list();

  return (
    <AppSettingsWorkspace {...configuration} modules={modules}>
      <AppSettingsCenter basePath={configuration.basePath} modules={modules} />
    </AppSettingsWorkspace>
  );
}
