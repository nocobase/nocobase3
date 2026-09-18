import type { ReactElement } from 'react';
import { SettingsShell } from '../settings-shell.js';
import ConversationCenterPage from './conversation-center-page.js';

export default function AIConversationsSettingsPage(): ReactElement {
  return (
    <SettingsShell
      title='Conversations'
      description='conversations.pageDescription'
    >
      <ConversationCenterPage />
    </SettingsShell>
  );
}
