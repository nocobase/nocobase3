import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type FormEvent,
} from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { Customer, CustomerOperation } from '../../server/types.js';
import { PageContainer } from '../components/page-container.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';

export default function CustomersPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation('@nocobase/app-plugin-audit-example');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<CustomerOperation[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logsError, setLogsError] = useState(false);
  const refresh = useCallback(async (): Promise<void> => {
    const response = await api.request<{ data: Customer[] }>({
      path: '/audit-example/customers',
    });
    setCustomers(response.data);
  }, [api]);
  const refreshLogs = useCallback(
    async (targetId?: string): Promise<void> => {
      setLogsError(false);
      try {
        const response = await api.request<{ data: CustomerOperation[] }>({
          path: '/audit-example/operations',
          query: { targetId },
        });
        setLogs(response.data);
      } catch {
        setLogsError(true);
      }
    },
    [api],
  );
  useEffect(() => {
    let active = true;
    void api
      .request<{ data: Customer[] }>({ path: '/audit-example/customers' })
      .then(
        (response) => {
          if (active) setCustomers(response.data);
        },
        () => {
          if (active) setError(t('loadFailed'));
        },
      );
    return () => {
      active = false;
    };
  }, [api, t]);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.request({
        path: editing
          ? `/audit-example/customers/${editing.id}`
          : '/audit-example/customers',
        method: editing ? 'PATCH' : 'POST',
        json: editing
          ? { id: editing.id, version: editing.version, name, phone }
          : { name, phone },
      });
      setEditing(null);
      setName('');
      setPhone('');
      setNotice(t('saved'));
      await refresh().catch(() => setError(t('loadFailed')));
      await refreshLogs();
    } catch {
      setError(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (customer: Customer): Promise<void> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.request({
        path: `/audit-example/customers/${customer.id}`,
        method: 'DELETE',
        json: { id: customer.id, version: customer.version },
      });
      if (editing?.id === customer.id) {
        setEditing(null);
        setName('');
        setPhone('');
      }
      setNotice(t('deleted'));
      await refresh().catch(() => setError(t('loadFailed')));
      await refreshLogs();
    } catch {
      setError(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageContainer>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{t('title')}</h1>
        <p className='text-muted-foreground'>{t('description')}</p>
      </header>
      <form
        onSubmit={(event) => {
          void save(event);
        }}
        className='grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-3'
      >
        <label className='space-y-2'>
          {t('name')}
          <Input
            aria-label={t('name')}
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className='space-y-2'>
          {t('phone')}
          <Input
            aria-label={t('phone')}
            required
            pattern='1[0-9]{10}'
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={busy}
          />
        </label>
        <div className='flex items-end gap-2'>
          <Button type='submit' disabled={busy}>
            {editing ? t('save') : t('create')}
          </Button>
          {editing && (
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setName('');
                setPhone('');
              }}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      {notice && <p role='status'>{notice}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('phone')}</TableHead>
            <TableHead>{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>{customer.name}</TableCell>
              <TableCell>{customer.phone}</TableCell>
              <TableCell className='flex gap-2'>
                <Button
                  disabled={busy}
                  variant='outline'
                  onClick={() => {
                    setEditing(customer);
                    setName(customer.name);
                    setPhone(customer.phone);
                  }}
                >
                  {t('edit')}
                </Button>
                <Button
                  disabled={busy}
                  variant='destructive'
                  onClick={() => {
                    void remove(customer);
                  }}
                >
                  {t('delete')}
                </Button>
                <Button
                  variant='ghost'
                  onClick={() => {
                    void refreshLogs(customer.id);
                  }}
                >
                  {t('logs')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!customers.length && (
            <TableRow>
              <TableCell colSpan={3}>{t('empty')}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <section className='space-y-4' aria-label={t('logs')}>
        <div className='flex items-center justify-between'>
          <h2 className='text-xl font-semibold'>{t('logs')}</h2>
          <Button
            variant='outline'
            onClick={() => {
              void refreshLogs();
            }}
          >
            {t('allLogs')}
          </Button>
        </div>
        {logsError && (
          <p role='alert' className='text-destructive'>
            {t('logsFailed')}
          </p>
        )}
        <ol className='space-y-3'>
          {logs.map((log) => (
            <li
              key={log.id}
              className='space-y-2 rounded-lg border bg-card p-4'
            >
              <p>
                <strong>
                  {t(log.action.replace('crm.customer.', 'action.'))}
                </strong>{' '}
                · {log.actor.id} · {log.result} ·{' '}
                {new Date(log.occurredAt).toLocaleString()}
              </p>
              <p className='text-sm text-muted-foreground'>
                {log.targetId} · {log.source.type}
              </p>
              <pre className='overflow-auto text-sm'>
                {JSON.stringify(
                  log.data.changes ?? log.data.phone ?? {},
                  null,
                  2,
                )}
              </pre>
            </li>
          ))}
        </ol>
        {!logs.length && <p className='text-muted-foreground'>{t('noLogs')}</p>}
      </section>
    </PageContainer>
  );
}
