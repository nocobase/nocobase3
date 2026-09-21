import type { ReactElement } from 'react';

import { SettingsShell } from '../settings-shell.js';
import UsageStatisticsPage from './usage-statistics-page.js';

export default function UsageStatisticsSettingsPage(): ReactElement {
  return (
    <SettingsShell title='Usage statistics' description='usage.pageDescription'>
      <UsageStatisticsPage />
    </SettingsShell>
  );
}
