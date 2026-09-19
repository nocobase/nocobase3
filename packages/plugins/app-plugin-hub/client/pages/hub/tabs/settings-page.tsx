import { Settings } from '../settings.js';
import { useHubAppPage } from '../app-page.js';
import type { ReactElement } from 'react';

export default function SettingsPage(): ReactElement {
  const context = useHubAppPage();
  return (
    <Settings
      key={JSON.stringify([
        context.app.app.id,
        context.app.app.name,
        context.app.deployment.activation,
      ])}
      name={context.app.app.name}
      activation={context.app.deployment.activation}
      busy={context.busy}
      canUpdate={context.capabilities['update-settings']}
      canRemove={context.capabilities.remove}
      onSave={context.onSaveSettings}
      onRemove={context.onRemove}
    />
  );
}
