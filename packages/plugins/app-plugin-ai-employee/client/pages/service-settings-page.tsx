import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router';
import { llmServicePath, mcpServicePath } from '../route-paths.js';

export default function AIServiceSettingsPage(): ReactElement {
  const location = useLocation();
  const state: unknown = location.state;
  const stateTab =
    state !== null &&
    typeof state === 'object' &&
    'aiSettingsTab' in state &&
    typeof state.aiSettingsTab === 'string'
      ? state.aiSettingsTab
      : undefined;
  const search = new URLSearchParams(location.search);
  const tabKey = search.get('tab') ?? stateTab;
  search.delete('tab');

  return (
    <Navigate
      to={{
        pathname: tabKey === 'mcp' ? mcpServicePath : llmServicePath,
        search: search.toString(),
        hash: location.hash,
      }}
      replace
    />
  );
}
