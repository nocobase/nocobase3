import {
  Boxes,
  ChevronRight,
  Grid2X2,
  List,
  LoaderCircle,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader } from '../../components/ui/card.js';
import { Input } from '../../components/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { type ReactElement } from 'react';
import type { AppSummary, ViewMode } from './types.js';
import {
  ViewButton,
  Empty,
  AppMark,
  StatusBadge,
  AppDialog,
  Field,
} from './shared.js';
import { formatDate } from './utils.js';

export function Catalog({
  apps,
  total,
  loading,
  refreshing,
  onRefresh,
  query,
  view,
  onQuery,
  onView,
  onCreate,
  onSelect,
}: {
  readonly apps: readonly AppSummary[];
  readonly total: number;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly query: string;
  readonly view: ViewMode;
  readonly onQuery: (value: string) => void;
  readonly onView: (value: ViewMode) => void;
  readonly onCreate: () => void;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  return (
    <>
      <header className='mb-7 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground'>
            <Boxes className='size-4' /> Application Hub
          </div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            Applications
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            Create, deploy, and operate applications from a single workspace.
          </p>
        </div>
      </header>
      <div className='mb-5 flex flex-wrap items-center gap-3'>
        <label className='flex h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border bg-background px-3'>
          <Search className='size-4 text-muted-foreground' />
          <Input
            className='h-auto border-0 p-0 focus-visible:ring-0'
            onChange={(event) => onQuery(event.target.value)}
            placeholder='Search applications…'
            value={query}
          />
        </label>
        <div className='ml-auto flex items-center gap-3'>
          <div className='flex h-10 items-center rounded-lg border bg-background p-1'>
            <ViewButton
              active={view === 'grid'}
              label='Grid view'
              onClick={() => onView('grid')}
              icon={<Grid2X2 />}
            />
            <ViewButton
              active={view === 'list'}
              label='List view'
              onClick={() => onView('list')}
              icon={<List />}
            />
          </div>
          <Button
            className='h-10'
            variant='outline'
            disabled={loading || refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            Refresh
          </Button>
          <Button className='h-10' onClick={onCreate}>
            <Plus className='size-4' /> New application
          </Button>
        </div>
      </div>
      {loading ? (
        <Empty
          icon={<LoaderCircle className='animate-spin' />}
          title='Loading applications'
        />
      ) : apps.length ? (
        view === 'grid' ? (
          <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {apps.map((app) => (
              <AppCard
                app={app}
                key={app.app.id}
                onClick={() => onSelect(app.app.id)}
              />
            ))}
          </div>
        ) : (
          <Card className='overflow-hidden py-0'>
            <Table>
              <TableHeader>
                <TableRow className='hover:bg-transparent'>
                  <TableHead>Application</TableHead>
                  <TableHead className='w-36'>Status</TableHead>
                  <TableHead className='w-40'>Release</TableHead>
                  <TableHead className='w-12'>
                    <span className='sr-only'>Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <AppListRow
                    app={app}
                    key={app.app.id}
                    onClick={() => onSelect(app.app.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : (
        <Empty
          icon={<PackageOpen />}
          title={total ? 'No applications found' : 'No applications yet'}
          description={
            total
              ? 'Try a different search.'
              : 'Create an application and upload its first release.'
          }
          action={
            total ? undefined : (
              <Button className='mt-5' onClick={onCreate}>
                <Plus className='size-4' /> New application
              </Button>
            )
          }
        />
      )}
    </>
  );
}

export function AppCard({
  app,
  onClick,
}: {
  readonly app: AppSummary;
  readonly onClick: () => void;
}): ReactElement {
  const version = app.currentVersion;
  return (
    <Card className='group relative overflow-hidden p-0 transition hover:border-primary/40 hover:shadow-md'>
      <Button
        className='h-auto w-full flex-col items-stretch rounded-xl p-0 text-left'
        onClick={onClick}
        variant='ghost'
      >
        <CardHeader className='p-3.5 pr-32 pb-2.5'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <AppMark name={app.app.name} small />
            <div className='min-w-0 flex-1'>
              <h2 className='truncate text-sm font-semibold'>{app.app.name}</h2>
              <p className='truncate font-mono text-[11px] text-muted-foreground'>
                {app.app.id}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className='flex items-center gap-2 px-3.5 pt-1 pb-3 text-[11px] text-muted-foreground'>
          <span className='font-medium text-foreground'>
            {version ? `v${version}` : 'Not deployed'}
          </span>
          <span aria-hidden='true'>·</span>
          <span>{formatDate(app.app.updatedAt)}</span>
        </CardContent>
      </Button>
      <div className='pointer-events-none absolute top-4 right-4'>
        <StatusBadge state={app.runtime.state} />
      </div>
      <ChevronRight className='pointer-events-none absolute right-3 bottom-3 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
    </Card>
  );
}

export function AppListRow({
  app,
  onClick,
}: {
  readonly app: AppSummary;
  readonly onClick: () => void;
}): ReactElement {
  const version = app.currentVersion;
  return (
    <TableRow className='cursor-pointer' onClick={onClick}>
      <TableCell>
        <div className='flex min-w-0 items-center gap-3'>
          <AppMark name={app.app.name} small />
          <div className='min-w-0'>
            <div className='truncate font-medium'>{app.app.name}</div>
            <div className='truncate font-mono text-xs text-muted-foreground'>
              {app.app.id}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge state={app.runtime.state} />
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>
        {version ? `v${version}` : 'Not deployed'}
      </TableCell>
      <TableCell>
        <Button
          aria-label={`Open ${app.app.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          size='icon'
          variant='ghost'
        >
          <ChevronRight />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function CreateDialog({
  busy,
  appId,
  name,
  onAppId,
  onName,
  onClose,
  onCreate,
}: {
  readonly busy: boolean;
  readonly appId: string;
  readonly name: string;
  readonly onAppId: (value: string) => void;
  readonly onName: (value: string) => void;
  readonly onClose: () => void;
  readonly onCreate: () => void;
}): ReactElement {
  return (
    <AppDialog
      title='Create application'
      description='Create a stable identity before deploying a release.'
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <Field label='Application name'>
          <Input
            autoFocus
            className='h-10'
            onChange={(event) => onName(event.target.value)}
            placeholder='Customer portal'
            required
            value={name}
          />
        </Field>
        <Field
          label='Application ID'
          hint='Used in URLs and storage. It cannot be changed later.'
        >
          <Input
            className='h-10 font-mono'
            onChange={(event) => onAppId(event.target.value)}
            pattern='[A-Za-z0-9_-]+'
            placeholder='customer-portal'
            required
            value={appId}
          />
        </Field>
        <div className='mt-6 flex justify-end gap-2'>
          <Button onClick={onClose} variant='outline'>
            Cancel
          </Button>
          <Button disabled={busy} type='submit'>
            Create application
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}
