import type { ReactElement } from 'react';
import { AISettingsShell } from '../ai-settings-shell.js';
import LLMServicePage from './llm-service-page.js';

export default function LLMServiceSettingsPage(): ReactElement {
  return (
    <AISettingsShell>
      <LLMServicePage />
    </AISettingsShell>
  );
}
