import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';

import { FileList } from '../components/file-list.js';
import { FileUploadField } from '../components/file-upload-field.js';
import {
  ordersRepository,
  resources,
  type BusinessFileRecord,
  type MutationValues,
  type OrderRecord,
  type OrderStatus,
} from '../lib/business.js';
import { useFileLabels } from '../lib/labels.js';

interface OrderRow {
  readonly order: OrderRecord;
  readonly attachments: readonly BusinessFileRecord[];
}

const statusClasses: Readonly<Record<OrderStatus, string>> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/10 text-primary',
  archived: 'bg-secondary text-secondary-foreground',
};

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** One-to-many demo: every order owns any number of attachment files. */
export default function OrderAttachmentsPage(): ReactElement {
  const { t, i18n } = useTranslation('@nocobase/app-plugin-file-example');
  const labels = useFileLabels();
  const api = useService(apiClientToken);
  const manager = useService(clientFileRepositoryManagerToken);
  const orders = useMemo(() => ordersRepository(api), [api]);
  const attachments = useMemo(
    () => manager.repository(resources.orderAttachments),
    [manager],
  );
  const [rows, setRows] = useState<readonly OrderRow[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState('');

  const fetchRows = useCallback(async (): Promise<readonly OrderRow[]> => {
    const [orderRows, fileRows] = await Promise.all([
      orders.findMany({ limit: 50 }),
      attachments.findMany({
        limit: 100,
        sort: (s) => s.field('createdAt').desc(),
      }),
    ]);
    const businessFiles: readonly BusinessFileRecord[] = fileRows;
    const grouped = new Map<string, BusinessFileRecord[]>();
    for (const file of businessFiles) {
      if (!file.orderId) continue;
      const list = grouped.get(file.orderId) ?? [];
      list.push(file);
      grouped.set(file.orderId, list);
    }
    return orderRows
      .map((order) => ({
        order,
        attachments: grouped.get(order.id) ?? [],
      }))
      .sort((left, right) =>
        left.order.number.localeCompare(right.order.number),
      );
  }, [orders, attachments]);

  useEffect(() => {
    let active = true;
    void fetchRows().then(
      (loaded) => {
        if (active) setRows(loaded);
      },
      (cause: unknown) => {
        if (active) setError(messageOf(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [fetchRows]);

  const mutate = useCallback(
    async (orderId: string, values: MutationValues): Promise<void> => {
      setBusyId(orderId);
      setError('');
      try {
        await orders.updateOne({ filter: { id: orderId }, values });
        setRows(await fetchRows());
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusyId(undefined);
      }
    },
    [orders, fetchRows],
  );

  const amount = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  return (
    <main className='mx-auto max-w-5xl space-y-6 p-8'>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{t('ordersTitle')}</h1>
        <p className='text-sm text-muted-foreground'>
          {t('ordersDescription')}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t('ordersRelationHint')}
        </p>
      </header>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {rows.map(({ order, attachments: files }) => (
        <section key={order.id} className='space-y-3 rounded-lg border p-4'>
          <header className='flex flex-wrap items-center gap-3'>
            <h2 className='font-medium'>{order.number}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${statusClasses[order.status]}`}
            >
              {t(`status.${order.status}`)}
            </span>
            <span className='text-sm text-muted-foreground'>
              {order.customerName}
            </span>
            <span className='ml-auto text-sm'>
              {amount.format(order.amountCents / 100)}
            </span>
          </header>
          <FileList
            files={files}
            labels={{ ...labels, remove: t('unlink') }}
            disabled={busyId === order.id}
            emptyState={t('ordersNoFiles')}
            onRemove={(file) =>
              mutate(order.id, {
                attachments: { disconnect: [{ id: file.id }] },
              })
            }
          />
          <FileUploadField
            repository={attachments}
            labels={labels}
            multiple
            disabled={busyId === order.id}
            onChange={(records) =>
              mutate(order.id, {
                attachments: {
                  connect: records.map((record) => ({ id: record.id })),
                },
              })
            }
          />
        </section>
      ))}
      {!rows.length && (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('ordersEmpty')}
        </p>
      )}
      <p className='text-sm text-muted-foreground'>{t('ordersHint')}</p>
    </main>
  );
}
