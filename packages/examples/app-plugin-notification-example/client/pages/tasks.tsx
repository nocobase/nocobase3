import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { useApiClient, type ApiClient } from '@nocobase/app-client';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import {
  createTask,
  errorMessage,
  listTasks,
  listUsers,
  type Task,
  type User,
} from '../lib/api.js';

export default function TasksPage(): ReactElement {
  const { i18n, t } = useTranslation(
    '@nocobase/app-plugin-notification-example',
  );
  const api = useApiClient();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [users, setUsers] = useState<readonly User[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const load = useCallback(async (): Promise<{
    tasks: Task[];
    users: User[];
  }> => {
    const [loadedTasks, loadedUsers] = await Promise.all([
      listTasks(api),
      listUsers(api),
    ]);
    return { tasks: loadedTasks, users: loadedUsers };
  }, [api]);

  function refresh(): void {
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    void load().then(
      ({ tasks: loadedTasks, users: loadedUsers }) => {
        if (!active) return;
        setTasks(loadedTasks);
        setUsers(loadedUsers);
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

  function handleCreated(task: Task): void {
    setTasks((current) => [
      task,
      ...current.filter((item) => item.id !== task.id),
    ]);
    setDrawerOpen(false);
    void navigate(`/notification-example/tasks/${task.id}`);
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('tasks.title')}
        description={t('tasks.description')}
      />
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <section>
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle>
                {t('tasks.listTitle')}
                <span className='ml-2 text-sm font-normal text-muted-foreground'>
                  {t('tasks.count', { count: tasks.length })}
                </span>
              </CardTitle>
              <div className='flex gap-2'>
                <Button variant='outline' disabled={loading} onClick={refresh}>
                  {t('tasks.refresh')}
                </Button>
                <Button
                  disabled={loading || !users.length}
                  onClick={() => setDrawerOpen(true)}
                >
                  {t('tasks.add')}
                </Button>
              </div>
            </div>
            <p className='text-sm text-muted-foreground'>
              {t('tasks.listDescription')}
            </p>
          </CardHeader>
          <CardContent className='space-y-4'>
            {loading ? (
              <div className='rounded-lg border p-12 text-center text-sm text-muted-foreground'>
                {t('common.loading')}
              </div>
            ) : !tasks.length ? (
              <p className='rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground'>
                {t('tasks.empty')}
              </p>
            ) : (
              <div className='overflow-hidden rounded-lg border'>
                <Table aria-label={t('tasks.listTitle')}>
                  <TableHeader>
                    <TableRow className='bg-muted/40 hover:bg-muted/40'>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.title')}
                      </TableHead>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.description')}
                      </TableHead>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.status')}
                      </TableHead>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.creator')}
                      </TableHead>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.assignee')}
                      </TableHead>
                      <TableHead className='whitespace-nowrap px-4 py-3 text-xs font-semibold text-foreground uppercase tracking-wider'>
                        {t('tasks.columns.updatedAt')}
                      </TableHead>
                      <TableHead className='px-4 py-3 text-right'>
                        <span className='sr-only'>
                          {t('tasks.columns.actions')}
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='divide-y divide-border/60'>
                    {tasks.map((task) => (
                      <TableRow
                        key={task.id}
                        className='transition-colors hover:bg-muted/30'
                      >
                        <TableCell className='max-w-56 truncate px-4 py-3 text-sm font-medium text-foreground'>
                          {task.title}
                        </TableCell>
                        <TableCell
                          className='max-w-72 truncate px-4 py-3 text-sm text-muted-foreground'
                          title={task.description}
                        >
                          {task.description}
                        </TableCell>
                        <TableCell className='px-4 py-3 text-sm'>
                          <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
                            {t(`status.${task.status}`)}
                          </span>
                        </TableCell>
                        <TableCell className='px-4 py-3 text-sm'>
                          {task.creator.name || task.creator.email}
                        </TableCell>
                        <TableCell className='px-4 py-3 text-sm'>
                          {task.assignee.name || task.assignee.email}
                        </TableCell>
                        <TableCell className='whitespace-nowrap px-4 py-3 text-xs text-muted-foreground'>
                          <time dateTime={task.updatedAt}>
                            {formatDate(task.updatedAt)}
                          </time>
                        </TableCell>
                        <TableCell className='px-4 py-3 text-right'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-7 px-2.5 text-xs'
                            render={
                              <Link
                                to={`/notification-example/tasks/${task.id}`}
                              />
                            }
                            nativeButton={false}
                          >
                            {t('tasks.view')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      <CreateTaskSheet
        key={`drawer-${drawerOpen}`}
        api={api}
        open={drawerOpen}
        users={users}
        onCreated={handleCreated}
        onOpenChange={setDrawerOpen}
      />
    </PageContainer>
  );
}

interface CreateTaskSheetProps {
  readonly api: ApiClient;
  readonly open: boolean;
  readonly users: readonly User[];
  readonly onCreated: (task: Task) => void;
  readonly onOpenChange: (open: boolean) => void;
}

function CreateTaskSheet({
  api,
  onCreated,
  onOpenChange,
  open,
  users,
}: CreateTaskSheetProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification-example');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(() => users[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const task = await createTask(api, { title, description, assigneeId });
      onCreated(task);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{t('tasks.drawerTitle')}</SheetTitle>
          <SheetDescription>{t('tasks.drawerDescription')}</SheetDescription>
        </SheetHeader>
        <form
          id='notification-example-create-task'
          className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5'
          onSubmit={(event) => void submit(event)}
        >
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <label className='block space-y-2'>
            <span className='text-sm font-medium'>{t('fields.title')}</span>
            <Input
              required
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
            <span className='text-sm font-medium'>{t('fields.assignee')}</span>
            <select
              required
              className='h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value=''>{t('fields.chooseAssignee')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </label>
          <SheetFooter className='-mx-5 mt-auto px-5'>
            <Button type='submit' disabled={saving || !assigneeId}>
              {saving ? t('common.saving') : t('tasks.create')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t('tasks.cancel')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
