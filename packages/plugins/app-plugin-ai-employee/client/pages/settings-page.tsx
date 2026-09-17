import type { ReactElement } from 'react';
import {
  matchPath,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useResolvedPath,
} from 'react-router';
import {
  AISettingsShell,
  getActiveAISettingsTabKey,
} from '../ai-settings-shell.js';
import {
  conversationCenterPath,
  llmServicePath,
  mcpServicePath,
} from '../route-paths.js';
import { getAISettingsTabs } from '../ai-settings.js';
import { SettingsTabPage } from '../settings-tab-page.js';

export default function AISettingsPage(): ReactElement {
  const tabs = getAISettingsTabs();
  const location = useLocation();
  const navigate = useNavigate();
  const parentPath = useResolvedPath('.');
  const isParentEntry = matchPath(
    { path: parentPath.pathname, end: true },
    location.pathname,
  );
  const activeTabKey = getActiveAISettingsTabKey(
    location.pathname,
    location.search,
    location.state,
  );
  if (
    isParentEntry &&
    ['conversations', 'llm-service', 'mcp'].includes(activeTabKey)
  ) {
    const search = new URLSearchParams(location.search);
    const isConversation = activeTabKey === 'conversations';
    search.delete('tab');
    return (
      <Navigate
        to={{
          pathname: isConversation
            ? conversationCenterPath
            : activeTabKey === 'mcp'
              ? mcpServicePath
              : llmServicePath,
          search: search.toString(),
          hash: location.hash,
        }}
        replace
      />
    );
  }

  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];

  return (
    <AISettingsShell
      activeTabKey={activeTab.key}
      onTabChange={(tabKey) => {
        const search = new URLSearchParams(location.search);
        search.set('tab', tabKey);
        void navigate({
          pathname: parentPath.pathname,
          search: search.toString(),
          hash: location.hash,
        });
      }}
    >
      {isParentEntry ? (
        <SettingsTabPage key={activeTab.key} tab={activeTab} />
      ) : (
        <Outlet />
      )}
    </AISettingsShell>
  );
}
