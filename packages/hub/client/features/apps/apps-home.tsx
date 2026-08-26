import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Plus,
  RefreshCw,
  ServerCog,
} from 'lucide-react';
import { useLink } from '@refinedev/core';
import { useState, type ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReleaseManagement } from '@nocobase/hub-release-management/client';
import { cn } from '@/lib/utils';
import {
  appStateLabel,
  appAccessDisabledReason,
  formatDateTime,
  isAppDeployed,
  latestDeployment,
} from './presentation';
import { AppAccessActions } from './app-access-actions';
import { presentReleaseControlError } from './release-control-error';
import { AppLifecycleActions } from './app-lifecycle-actions';
import { CreateAppDialog } from './create-app-dialog';

export default function AppsHome() {
  const Link = useLink();
  const [createOpen, setCreateOpen] = useState(false);
  const {
    overview,
    busy,
    error,
    errorCode,
    errorStatus,
    refresh,
    runLifecycle,
  } = useReleaseManagement();
  const controlError = error
    ? presentReleaseControlError(error, errorCode, errorStatus)
    : null;
  const deployed = overview.apps.filter(isAppDeployed).length;
  const releases = overview.apps.reduce(
    (total, app) => total + app.releases.length,
    0,
  );
  const failed = overview.deployments.filter(
    (deployment) => deployment.status === 'failed',
  ).length;

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_11%,transparent),transparent_42%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-14 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end'>
          <div className='max-w-3xl space-y-4'>
            <Badge
              variant='outline'
              className='h-7 gap-1.5 bg-background/70 px-3'
            >
              <Boxes /> 应用中心
            </Badge>
            <div>
              <h1 className='font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
                企业应用
              </h1>
              <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
                打开业务应用，查看运行状态，并管理应用的版本与资源。
              </p>
            </div>
          </div>
          <div className='flex w-fit flex-wrap gap-2'>
            <Button size='lg' onClick={() => setCreateOpen(true)}>
              <Plus /> 创建应用
            </Button>
            <Button
              variant='outline'
              size='lg'
              className='bg-background/75'
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn(busy && 'animate-spin')} />
              刷新状态
            </Button>
          </div>
        </div>
      </section>

      <CreateAppDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />

      {controlError ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>{controlError.title}</AlertTitle>
          <AlertDescription>{controlError.description}</AlertDescription>
        </Alert>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          label='应用总数'
          value={controlError ? null : overview.apps.length}
          icon={Boxes}
        />
        <MetricCard
          label='已发布'
          value={controlError ? null : deployed}
          icon={CheckCircle2}
          tone='success'
        />
        <MetricCard
          label='可用版本'
          value={controlError ? null : releases}
          icon={PackageCheck}
        />
        <MetricCard
          label='发布失败'
          value={controlError ? null : failed}
          icon={AlertCircle}
          tone={failed > 0 ? 'danger' : 'default'}
        />
      </section>

      <section className='space-y-3'>
        <div className='flex items-end justify-between gap-4 px-1'>
          <div>
            <h2 className='font-heading text-xl font-semibold'>全部应用</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              打开应用开始工作，或进入详情管理版本与运行资源。
            </p>
          </div>
          <Badge variant='secondary'>{overview.apps.length} 个</Badge>
        </div>

        {busy && overview.apps.length === 0 ? (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className='h-64 rounded-xl' />
            ))}
          </div>
        ) : controlError ? (
          <Card className='border-dashed py-12'>
            <CardContent className='mx-auto max-w-lg text-center'>
              <div className='mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive'>
                <ServerCog />
              </div>
              <h3 className='mt-4 font-heading text-lg font-semibold'>
                应用清单暂不可用
              </h3>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {controlError.description}
              </p>
            </CardContent>
          </Card>
        ) : overview.apps.length === 0 ? (
          <Card className='border-dashed py-12'>
            <CardContent className='mx-auto max-w-lg text-center'>
              <div className='mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground'>
                <ServerCog />
              </div>
              <h3 className='mt-4 font-heading text-lg font-semibold'>
                暂无应用
              </h3>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                创建一个空应用，然后按照指引在本地开发并部署到 Hub。
              </p>
              <Button className='mt-5' onClick={() => setCreateOpen(true)}>
                <Plus /> 创建应用
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {overview.apps.map((app) => {
              const lastDeployment = latestDeployment(
                overview.deployments,
                app.id,
              );
              const deployed = isAppDeployed(app);
              return (
                <Card
                  key={app.id}
                  className='transition-all hover:-translate-y-0.5 hover:ring-primary/30 hover:shadow-md'
                >
                  <CardHeader>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='grid size-11 place-items-center rounded-xl bg-primary/10 text-primary'>
                        <Boxes className='size-5' />
                      </div>
                      <Badge variant={deployed ? 'default' : 'outline'}>
                        {appStateLabel(app.state)}
                      </Badge>
                    </div>
                    <CardTitle className='mt-3 text-lg'>{app.name}</CardTitle>
                    <CardDescription className='font-mono text-xs'>
                      {app.id}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <InfoRow
                      label='当前版本'
                      value={app.activeVersion ?? '尚未发布'}
                    />
                    <InfoRow
                      label='可用版本'
                      value={`${app.releases.length} 个`}
                    />
                    <InfoRow
                      label='最近操作'
                      value={formatDateTime(lastDeployment?.requestedAt)}
                      icon={<Clock3 className='size-3.5' />}
                    />
                  </CardContent>
                  <CardFooter className='flex-wrap justify-end gap-2'>
                    {deployed ? (
                      <>
                        <AppAccessActions
                          accessUrl={app.accessUrl}
                          disabledReason={appAccessDisabledReason(app)}
                          showCopy={false}
                          size='sm'
                        />
                        <AppLifecycleActions
                          app={app}
                          busy={busy}
                          compact
                          onExecute={(action) =>
                            void runLifecycle({ appId: app.id, action })
                          }
                        />
                      </>
                    ) : null}
                    <Button
                      size='sm'
                      variant='outline'
                      nativeButton={false}
                      render={
                        <Link to={`/apps/${encodeURIComponent(app.id)}`} />
                      }
                    >
                      管理 <ArrowRight />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | null;
  icon: typeof Boxes;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <Card size='sm' aria-label={`${label}：${value ?? '暂不可用'}`}>
      <CardContent className='flex items-center justify-between py-1'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 font-heading text-2xl font-semibold'>
            {value ?? '—'}
          </p>
        </div>
        <div
          className={cn(
            'grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground',
            tone === 'success' && 'bg-emerald-500/10 text-emerald-600',
            tone === 'danger' && 'bg-destructive/10 text-destructive',
          )}
        >
          <Icon className='size-5' />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className='flex items-center justify-between gap-3 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='flex min-w-0 items-center gap-1.5 truncate font-medium'>
        {icon}
        {value}
      </span>
    </div>
  );
}
