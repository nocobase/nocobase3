import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
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
  loadRelationProjectState,
  runRelationMutationScenario,
  type RelationProjectState,
  type RelationMutationScenario,
} from '../relation-mutations.js';

const NS = '@nocobase/app-plugin-repository-example';

interface ProjectStateProps {
  readonly title: string;
  readonly description: string;
  readonly state: RelationProjectState;
}

function ProjectState({
  title,
  description,
  state,
}: ProjectStateProps): ReactElement {
  const { t } = useTranslation(NS);
  const project = state.project;
  if (!project)
    return (
      <Card role='region' aria-label={title}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{t('relationSeedHint')}</p>
        </CardContent>
      </Card>
    );

  const through = new Map(state.through.map((item) => [item.tagId, item.role]));
  const tasks = [...(project.tasks ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const tags = [...(project.tags ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return (
    <Card role='region' aria-label={title}>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>{title}</CardTitle>
          <Badge variant='outline'>{project.status}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div>
          <p className='font-medium'>{project.name}</p>
          <code className='text-xs text-muted-foreground'>{project.id}</code>
        </div>
        <dl className='grid gap-3 sm:grid-cols-2'>
          <div className='rounded-lg border p-3'>
            <dt className='text-xs text-muted-foreground'>
              {t('relationOwnerLabel')}
            </dt>
            <dd className='mt-1 font-medium'>
              {project.owner?.name ?? t('none')}
            </dd>
          </div>
          <div className='rounded-lg border p-3'>
            <dt className='text-xs text-muted-foreground'>
              {t('relationProfileLabel')}
            </dt>
            <dd className='mt-1 font-medium'>
              {project.profile?.summary ?? t('none')}
            </dd>
          </div>
        </dl>
        <div className='space-y-2'>
          <h3 className='font-medium'>{t('relationTasksLabel')}</h3>
          <Table aria-label={`${title} — ${t('relationTasks')}`}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('findManyRecordTitle')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('relationPoints')}</TableHead>
                <TableHead>{t('relationAssignee')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <span className='block'>{task.title}</span>
                    <code className='text-xs text-muted-foreground'>
                      {task.id}
                    </code>
                  </TableCell>
                  <TableCell>{task.status}</TableCell>
                  <TableCell>{task.points}</TableCell>
                  <TableCell>{task.assignee?.name ?? t('none')}</TableCell>
                </TableRow>
              ))}
              {!tasks.length && (
                <TableRow>
                  <TableCell colSpan={4}>{t('none')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className='space-y-2'>
          <h3 className='font-medium'>{t('relationTagsLabel')}</h3>
          <div className='flex flex-wrap gap-2'>
            {tags.map((tag) => (
              <Badge key={tag.id} variant='secondary'>
                {tag.label} · role={through.get(tag.id) ?? 'NULL'}
              </Badge>
            ))}
            {!tags.length && <span>{t('none')}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RelationMutationsPage(): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation(NS);
  const [baseline, setBaseline] = useState<RelationProjectState>();
  const [scenario, setScenario] = useState<RelationMutationScenario>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadRelationProjectState(api, 'project-1')
      .then((state) => {
        if (active) setBaseline(state);
      })
      .catch((value: unknown) => {
        if (active)
          setError(value instanceof Error ? value.message : t('loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  async function run(): Promise<void> {
    setRunning(true);
    setError('');
    try {
      setScenario(await runRelationMutationScenario(api));
    } catch (value) {
      setError(value instanceof Error ? value.message : t('error'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>
          {t('relationMutationsTitle')}
        </h1>
        <p className='max-w-4xl text-muted-foreground'>
          {t('relationMutationsIntro')}
        </p>
      </header>

      {loading && <p role='status'>{t('loading')}</p>}
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}

      {baseline && (
        <ProjectState
          title={t('relationBaselineTitle')}
          description={t('relationBaselineDescription')}
          state={baseline}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('relationRunTitle')}</CardTitle>
          <CardDescription>{t('relationRunDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <pre className='overflow-x-auto rounded-md bg-muted p-3 text-xs'>
            <code>{`const projects = api.repository('repositoryExampleRelationProjects');

await projects.createOne({ values: { owner: { connect: ... }, profile: { create: ... }, tasks: { create: [...] }, tags: { connect: ... } } });
await projects.updateOne({ values: { tasks: { create, connect, disconnect, update, upsert, delete }, tags: { connect, create } } });
await projects.updateOne({ values: { tags: { set: [...] } } });`}</code>
          </pre>
          <div className='flex flex-wrap items-center gap-3'>
            <Button
              disabled={loading || running || !baseline?.project}
              onClick={() => void run()}
            >
              {running ? t('loading') : t('relationRunButton')}
            </Button>
            <span className='text-sm text-muted-foreground'>
              {t('relationRunIsolation')}
            </span>
          </div>
        </CardContent>
      </Card>

      {scenario && (
        <>
          <ProjectState
            title={t('relationResultTitle')}
            description={t('relationResultDescription')}
            state={scenario.state}
          />
          <Card role='region' aria-label={t('relationLifetimeTitle')}>
            <CardHeader>
              <CardTitle>{t('relationLifetimeTitle')}</CardTitle>
              <CardDescription>
                {t('relationLifetimeDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>
                {t('relationDisconnectCheck', {
                  exists: String(scenario.disconnectedTaskExists),
                  projectId: scenario.disconnectedTaskProjectId ?? 'NULL',
                })}
              </Badge>
              <Badge variant='destructive'>
                {t('relationDeleteCheck', {
                  exists: String(scenario.deletedTaskExists),
                })}
              </Badge>
              <Badge variant='secondary'>
                {t('relationSetCheck', {
                  exists: String(scenario.disconnectedTagExists),
                })}
              </Badge>
            </CardContent>
          </Card>
          <details className='rounded-lg border p-4'>
            <summary className='cursor-pointer font-medium'>
              {t('trace')}
            </summary>
            <p className='my-3 text-sm text-muted-foreground'>
              {t('relationTraceHint')}
            </p>
            <pre className='max-h-[36rem] overflow-auto text-xs'>
              {JSON.stringify(scenario.calls, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
