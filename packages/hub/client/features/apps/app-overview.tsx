import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Rocket,
  ServerCog,
} from 'lucide-react';
import { useLink } from '@refinedev/core';
import { useParams } from 'react-router';

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
  displayAppName,
  formatDateTime,
  isAppDeployed,
  latestDeployment,
} from './presentation';
import { AppAccessActions } from './app-access-actions';
import { AppLifecycleActions } from './app-lifecycle-actions';

export default function AppOverview() {
  const Link = useLink();
  const { appId = '' } = useParams();
  const { scopedOverview, busy, error, refresh, runLifecycle } =
    useReleaseManagement({
      appId,
    });
  const app = scopedOverview.apps[0];
  const lastDeployment = latestDeployment(scopedOverview.deployments, appId);
  const appName = app?.name ?? displayAppName(appId);
  const deployed = app ? isAppDeployed(app) : false;

  if (busy && !app) {
    return (
      <div className='space-y-5'>
        <Skeleton className='h-48 rounded-2xl' />
        <div className='grid gap-4 md:grid-cols-3'>
          <Skeleton className='h-28 rounded-xl' />
          <Skeleton className='h-28 rounded-xl' />
          <Skeleton className='h-28 rounded-xl' />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_42%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-14 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end'>
          <div className='max-w-3xl'>
            <Button
              variant='ghost'
              size='sm'
              nativeButton={false}
              className='mb-3 -ml-2'
              render={<Link to='/apps' />}
            >
              <ArrowLeft /> 返回应用中心
            </Button>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='bg-background/70'>
                应用
              </Badge>
              <Badge variant={deployed ? 'default' : 'outline'}>
                {appStateLabel(app?.state ?? 'not-deployed')}
              </Badge>
            </div>
            <h1 className='mt-4 font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
              {appName}
            </h1>
            <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
              打开业务系统，或管理应用的版本与运行资源。
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <AppAccessActions
              accessUrl={app?.accessUrl ?? null}
              disabledReason={appAccessDisabledReason(app)}
              showCopy={false}
              size='lg'
            />
            {app ? (
              <AppLifecycleActions
                app={app}
                busy={busy}
                onExecute={(action) =>
                  void runLifecycle({ appId: app.id, action })
                }
              />
            ) : null}
            <Button
              variant='outline'
              className='bg-background/75'
              onClick={() => void refresh()}
            >
              刷新状态
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>无法读取 App 运行状态</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {app?.lifecycleError ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>App 状态切换失败</AlertTitle>
          <AlertDescription>
            {app.lifecycleError.message}
            <span className='mt-1 block font-mono text-xs'>
              {app.lifecycleError.code}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {!app && !error ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>App 不存在或尚未被 App Host 发现</AlertTitle>
          <AlertDescription>
            该应用暂未接入或当前不可用，请返回应用中心选择已有应用。
          </AlertDescription>
        </Alert>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatusCard
          label='应用状态'
          value={appStateLabel(app?.state ?? 'not-deployed')}
          icon={deployed ? CheckCircle2 : Clock3}
          tone={deployed ? 'success' : 'default'}
        />
        <StatusCard
          label='当前版本'
          value={app?.activeVersion ?? '未发布'}
          icon={PackageCheck}
        />
        <StatusCard
          label='可用版本'
          value={`${app?.releases.length ?? 0} 个`}
          icon={Rocket}
        />
        <StatusCard
          label='最近变更'
          value={formatDateTime(lastDeployment?.requestedAt)}
          icon={Clock3}
        />
      </section>

      <section className='grid gap-4 lg:grid-cols-2'>
        <ActionCard
          title='版本与发布'
          description='查看版本和发布记录，并在需要时恢复稳定版本。'
          icon={Rocket}
          detail={`${app?.releases.length ?? 0} 个版本可用`}
          to={`/apps/${encodeURIComponent(appId)}/deployments`}
        />
        <ActionCard
          title='运行资源'
          description='查看应用使用的数据库、文件存储等基础资源及其状态。'
          icon={ServerCog}
          detail={`${app?.resources.length ?? 0} 项资源已接入`}
          to={`/apps/${encodeURIComponent(appId)}/resources`}
        />
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: typeof Rocket;
  tone?: 'default' | 'success';
}) {
  return (
    <Card size='sm'>
      <CardContent className='flex items-center justify-between py-1'>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 truncate font-heading text-lg font-semibold'>
            {value}
          </p>
        </div>
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground',
            tone === 'success' && 'bg-emerald-500/10 text-emerald-600',
          )}
        >
          <Icon className='size-5' />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title,
  description,
  icon: Icon,
  detail,
  to,
}: {
  title: string;
  description: string;
  icon: typeof Rocket;
  detail: string;
  to: string;
}) {
  const Link = useLink();
  return (
    <Card className='transition-colors hover:ring-primary/30'>
      <CardHeader>
        <div className='grid size-10 place-items-center rounded-xl bg-primary/10 text-primary'>
          <Icon />
        </div>
        <CardTitle className='mt-3'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className='justify-between'>
        <span className='text-xs text-muted-foreground'>{detail}</span>
        <Button size='sm' nativeButton={false} render={<Link to={to} />}>
          打开 <ArrowRight />
        </Button>
      </CardFooter>
    </Card>
  );
}
