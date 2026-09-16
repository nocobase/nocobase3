import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Button } from './ui/button.js';

export const MAIL_LOG_PAGE_SIZE = 20;

export function MailLogPagination({
  page,
  hasNext,
  disabled,
  onPageChange,
}: {
  readonly page: number;
  readonly hasNext: boolean;
  readonly disabled?: boolean;
  readonly onPageChange: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('logs.pagination', { defaultValue: 'Log pagination' })}
      className='flex flex-wrap items-center justify-end gap-3 border-t p-4'
    >
      <span className='mr-auto text-sm text-muted-foreground' role='status'>
        {t('logs.page', {
          defaultValue: 'Page {{page}} · {{pageSize}} per page',
          page,
          pageSize: MAIL_LOG_PAGE_SIZE,
        })}
      </span>
      <Button
        variant='outline'
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('dev.bulkSend.previousLogs', { defaultValue: 'Previous page' })}
      </Button>
      <Button
        variant='outline'
        disabled={disabled || !hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        {t('dev.bulkSend.nextLogs', { defaultValue: 'Next page' })}
      </Button>
    </nav>
  );
}
