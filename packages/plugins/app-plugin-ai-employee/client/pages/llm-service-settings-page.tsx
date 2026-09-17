import type { ReactElement } from 'react';
import { SettingsShell } from '../settings-shell.js';
import LLMServicePage from './llm-service-page.js';

export default function LLMServiceSettingsPage(): ReactElement {
  return (
    <SettingsShell title='LLM services' description='Manage LLM services.'>
      <LLMServicePage />
    </SettingsShell>
  );
}
