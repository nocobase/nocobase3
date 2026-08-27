import {
  AISettingsShell,
  aiEmployeePath,
} from '@nocobase/app-plugin-ai-knowledge-base/client';
import { useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

export default function AISettingsEntry(): ReactElement {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate(aiEmployeePath, { replace: true });
  }, [navigate]);

  return (
    <AISettingsShell>
      <main className='p-8 text-sm text-muted-foreground'>
        Opening AI Employee…
      </main>
    </AISettingsShell>
  );
}
