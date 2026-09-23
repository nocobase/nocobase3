import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, useParams } from 'react-router';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
import { Textarea } from '../components/ui/textarea.js';
import {
  errorMessage,
  getTask,
  listUsers,
  TASK_STATUSES,
  updateTask,
  type Task,
  type TaskStatus,
  type User,
} from '../lib/api.js';

export default function TaskDetailPage(): ReactElement {
  const { i18n, t } = useTranslation(
    '@nocobase/app-plugin-notification-example',
  );
  const api = useApiClient();
  const { taskId } = useParams();
  const [task, setTask] = useState<Task>();
  const [users, setUsers] = useState<readonly User[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [assigneeId, setAssigneeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const load = useCallback(async (): Promise<
    { task: Task; users: User[] } | undefined
  > => {
    if (!taskId) return undefined;
    const [loadedTask, loadedUsers] = await Promise.all([
      getTask(api, taskId),
      listUsers(api),
    ]);
    return { task: loadedTask, users: loadedUsers };
  }, [api, taskId]);

  useEffect(() => {
    let active = true;
    void load().then(
      (result) => {
        if (!active || !result) return;
        const { task: loadedTask, users: loadedUsers } = result;
        setTask(loadedTask);
        setUsers(loadedUsers);
        setTitle(loadedTask.title);
        setDescription(loadedTask.description);
        setStatus(loadedTask.status);
        setAssigneeId(loadedTask.assigneeId);
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(errorMessage(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [load, revision]);

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function startEditing(): void {
    setError('');
    setEditing(true);
  }

  function refresh(): void {
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!taskId) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateTask(api, taskId, {
        title,
        description,
        status,
        assigneeId,
      });
      setTask(updated);
      setTitle(updated.title);
      setDescription(updated.description);
      setStatus(updated.status);
      setAssigneeId(updated.assigneeId);
      setEditing(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('taskDetail.title')}
        description={t('taskDetail.description')}
      />
      {error && !editing ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className='text-sm text-muted-foreground'>{t('common.loading')}</p>
      ) : null}
      {!loading && task ? (
        <>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              render={<Link to='/notification-example' />}
              nativeButton={false}
            >
              {t('taskDetail.back')}
            </Button>
            <Button
              variant='outline'
              disabled={loading || saving}
              onClick={refresh}
            >
              {t('taskDetail.refresh')}
            </Button>
            <Button onClick={startEditing} disabled={saving}>
              {t('taskDetail.edit')}
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('taskDetail.summary')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-5'>
              <dl className='grid gap-4 sm:grid-cols-2'>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('fields.title')}
                  </dt>
                  <dd className='mt-1 text-sm font-medium'>{task.title}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('fields.status')}
                  </dt>
                  <dd className='mt-1'>
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
                      {t(`status.${task.status}`)}
                    </span>
                  </dd>
                </div>
                <div className='sm:col-span-2'>
                  <dt className='text-xs text-muted-foreground'>
                    {t('fields.description')}
                  </dt>
                  <dd className='mt-1 whitespace-pre-wrap text-sm'>
                    {task.description}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('fields.creator')}
                  </dt>
                  <dd className='mt-1 text-sm'>
                    {task.creator.name || task.creator.email}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('fields.assignee')}
                  </dt>
                  <dd className='mt-1 text-sm'>
                    {task.assignee.name || task.assignee.email}
                  </dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('taskDetail.createdAt')}
                  </dt>
                  <dd className='mt-1 text-sm'>{formatDate(task.createdAt)}</dd>
                </div>
                <div>
                  <dt className='text-xs text-muted-foreground'>
                    {t('taskDetail.updatedAt')}
                  </dt>
                  <dd className='mt-1 text-sm'>{formatDate(task.updatedAt)}</dd>
                </div>
              </dl>
              <p className='border-t pt-4 text-sm leading-6 text-muted-foreground'>
                {t('taskDetail.notificationHint')}
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
      {!loading && !task ? (
        <Button
          variant='outline'
          render={<Link to='/notification-example' />}
          nativeButton={false}
        >
          {t('taskDetail.back')}
        </Button>
      ) : null}
      <Sheet
        open={editing}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditing(false);
            setError('');
          }
        }}
      >
        <SheetContent
          className='overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl'
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle>{t('taskDetail.edit')}</SheetTitle>
            <SheetDescription>{t('taskDetail.description')}</SheetDescription>
          </SheetHeader>
          {error ? (
            <p role='alert' className='px-5 text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <Card className='mx-5 mb-5'>
            <CardContent className='pt-5'>
              <form
                className='space-y-5'
                onSubmit={(event) => void submit(event)}
              >
                <label className='block space-y-2'>
                  <span className='text-sm font-medium'>
                    {t('fields.title')}
                  </span>
                  <Input
                    required
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className='block space-y-2'>
                  <span className='text-sm font-medium'>
                    {t('fields.description')}
                  </span>
                  <Textarea
                    required
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className='block space-y-2'>
                  <span className='text-sm font-medium'>
                    {t('fields.status')}
                  </span>
                  <select
                    className='h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as TaskStatus)
                    }
                  >
                    {TASK_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {t(`status.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='block space-y-2'>
                  <span className='text-sm font-medium'>
                    {t('fields.assignee')}
                  </span>
                  <select
                    className='h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <p className='rounded-lg border border-dashed bg-muted/20 p-3 text-sm leading-6 text-muted-foreground'>
                  {t('taskDetail.notificationHint')}
                </p>
                <SheetFooter className='-mx-5 mb-[-1.25rem] px-5'>
                  <Button type='submit' disabled={saving}>
                    {saving ? t('common.saving') : t('taskDetail.save')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    {t('taskDetail.cancel')}
                  </Button>
                </SheetFooter>
              </form>
            </CardContent>
          </Card>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
