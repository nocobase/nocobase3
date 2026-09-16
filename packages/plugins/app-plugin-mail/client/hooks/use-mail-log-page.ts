import { useEffect, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { mailErrorMessage, type MailAccountView } from '../mail-client.js';
import { MAIL_LOG_PAGE_SIZE } from '../components/mail-log-pagination.js';

export function useMailLogPage<T>(
  load: (
    offset: number,
    limit: number,
  ) => Promise<readonly [readonly MailAccountView[], readonly T[]]>,
) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [rows, setRows] = useState<readonly T[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void load((page - 1) * MAIL_LOG_PAGE_SIZE, MAIL_LOG_PAGE_SIZE + 1)
      .then(([nextAccounts, nextRows]) => {
        if (!active) return;
        setAccounts(nextAccounts);
        setRows(nextRows.slice(0, MAIL_LOG_PAGE_SIZE));
        setHasNext(nextRows.length > MAIL_LOG_PAGE_SIZE);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setRows([]);
        setHasNext(false);
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, page, revision, t]);
  const refresh = () => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  };
  const changePage = (next: number) => {
    setLoading(true);
    setError(undefined);
    setPage(next);
  };
  return { page, changePage, refresh, accounts, rows, hasNext, loading, error };
}
