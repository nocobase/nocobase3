import type { ReactElement } from 'react';
import { SettingsShell } from '../settings-shell.js';
import MCPPage from './mcp-page.js';

export default function MCPServiceSettingsPage(): ReactElement {
  return (
    <SettingsShell title='MCP services' description='Manage MCP services.'>
      <MCPPage />
    </SettingsShell>
  );
}
