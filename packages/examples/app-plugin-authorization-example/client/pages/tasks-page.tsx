import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { createTask, tasksRepository, type Task } from '../model.js';

const NS = '@nocobase/app-plugin-authorization-example';

export default function TasksPage(): ReactElement {
  const api = useService(apiClientToken);
  const repository = useMemo(() => tasksRepository(api), [api]);
  const { t } = useTranslation(NS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');

  const report = useCallback(
    (value: unknown): void => {
      // A caller with no grant is not an error the page should shout about.
      if (value instanceof ApiClientError && value.status === 403) {
        setForbidden(true);
        return;
      }
      setError(value instanceof Error ? value.message : t('error'));
    },
    [t],
  );

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void repository
      .findMany({ limit: 100 })
      .then((result) => {
        if (!active) return;
        setTasks(result);
        setForbidden(false);
      })
      .catch((value: unknown) => {
        if (!active) return;
        setTasks([]);
        report(value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, revision, report]);

  const reload = (): void => {
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  };

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await action();
      reload();
    } catch (value) {
      report(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className='mx-auto max-w-3xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>{t('title')}</h1>
        <p className='text-muted-foreground'>{t('intro')}</p>
        <p className='text-muted-foreground'>{t('intro2')}</p>
      </header>
      {error && (
        <p
          role='alert'
          className='rounded-md border border-destructive/30 p-3 text-destructive'
        >
          {error}
        </p>
      )}
      {forbidden && <p role='status'>{t('forbidden')}</p>}
      {loading && <p role='status'>{t('loading')}</p>}
      <form
        className='flex gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          const value = title.trim();
          if (!value) return;
          void run(async () => {
            await createTask(api, value);
            setTitle('');
          });
        }}
      >
        <Input
          aria-label={t('newTask')}
          placeholder={t('newTask')}
          maxLength={255}
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type='submit' disabled={busy || !title.trim()}>
          {t('add')}
        </Button>
      </form>
      {!loading && !forbidden && tasks.length === 0 && (
        <p role='status'>{t('empty')}</p>
      )}
      <ul className='space-y-3'>
        {tasks.map((task) => (
          <li key={task.id}>
            <Card>
              <CardHeader className='flex flex-wrap items-center justify-between gap-2'>
                <CardTitle>{task.title}</CardTitle>
                <Badge
                  variant={task.status === 'done' ? 'secondary' : 'default'}
                >
                  {t(task.status === 'done' ? 'statusDone' : 'statusOpen')}
                </Badge>
              </CardHeader>
              <CardContent className='flex flex-wrap items-center gap-2'>
                <span className='flex-1 text-sm text-muted-foreground'>
                  {t('owner')}: {task.ownerId}
                </span>
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      repository.updateOne({
                        filter: { id: task.id },
                        values: {
                          status: task.status === 'done' ? 'open' : 'done',
                          updatedAt: new Date().toISOString(),
                        },
                      }),
                    )
                  }
                >
                  {t(task.status === 'done' ? 'reopen' : 'done')}
                </Button>
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      repository.deleteOne({ filter: { id: task.id } }),
                    )
                  }
                >
                  {t('delete')}
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
