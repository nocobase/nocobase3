import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { MailDevPageShell, MailNavigationIcon } from '../components/index.js';
import { Card } from '../components/ui/card.js';
import MailWorkspacePage from './mail-workspace-page.js';
export { default as MailSendDevPage } from './mail-send-page.js';

export function MailCenterDevPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <MailDevPageShell
      badge={t('nav.dev', { defaultValue: 'Mail components' })}
      category={t('dev.centerCategory', { defaultValue: 'Mailbox preview' })}
      description={t('dev.centerDescription', {
        defaultValue:
          'Filter, refresh, and inspect locally stored mail components.',
      })}
      title={t('dev.centerTitle', { defaultValue: 'Mail center' })}
      actions={
        <span
          aria-label={t('nav.mail', { defaultValue: 'Mail' })}
          className='inline-flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground'
          role='img'
        >
          <MailNavigationIcon />
        </span>
      }
    >
      <Card className='flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-background shadow-sm lg:max-h-[calc(100svh-18rem)]'>
        <MailWorkspacePage />
      </Card>
    </MailDevPageShell>
  );
}

export default MailCenterDevPage;
