import { I18nProvider, I18nRuntime } from '@nocobase/i18n/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './app';

// Registry items translate through @nocobase/i18n, so the preview mounts a runtime the way an application does. It
// registers no resources, which leaves every string at its English default.
const i18n = new I18nRuntime({ defaultLocale: 'en-US', locales: ['en-US'] });

void i18n.init().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider runtime={i18n}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
