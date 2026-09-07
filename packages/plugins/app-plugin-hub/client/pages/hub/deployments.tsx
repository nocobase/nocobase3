import {
  Boxes,
  Clipboard,
  ClipboardCheck,
  MoreHorizontal,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { useState, type ReactElement } from 'react';
import type { AppDetail, DeploymentRecord } from './types.js';
import { Empty, StatusBadge, AppDialog } from './shared.js';
import { shortId, deploymentPhaseLabel, formatDateTime } from './utils.js';

export function Deployments({
  app,
  busy,
  onDeploy,
  onRollback,
}: {
  readonly app: AppDetail;
  readonly busy: boolean;
  readonly onDeploy: () => void;
  readonly onRollback: (deploymentId: string) => void;
}): ReactElement {
  if (app.deployments.length === 0) {
    return (
      <Empty
        icon={<Boxes />}
        title='No deployments yet'
        description='Deploy a release to create the first deployment.'
        action={
          <Button disabled={busy || !app.hasReleases} onClick={onDeploy}>
            <Play className='size-4' /> Deploy
          </Button>
        }
      />
    );
  }
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>Deployments</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Each row is a deployment operation. Rolling back creates a new
            deployment using the selected release and configuration.
          </p>
        </div>
        <Button disabled={busy || !app.hasReleases} onClick={onDeploy}>
          <Play className='size-4' /> Deploy
        </Button>
      </div>
      <div className='overflow-hidden rounded-lg border bg-card'>
        <Table>
          <TableHeader className='bg-muted/20'>
            <TableRow>
              <TableHead className='w-[34%]'>Release</TableHead>
              <TableHead className='w-[26%]'>Deployment</TableHead>
              <TableHead className='w-[20%]'>Status</TableHead>
              <TableHead className='w-[20%]'>Created</TableHead>
              <TableHead className='w-12'>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {app.deployments.map((deployment) => {
              const deployedRelease = deployment.release;
              const current = deployment.id === app.app.currentDeploymentId;
              return (
                <TableRow
                  className={
                    current
                      ? 'bg-primary/[0.025] hover:bg-primary/[0.045]'
                      : undefined
                  }
                  key={deployment.id}
                >
                  <TableCell className='py-3'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium tabular-nums'>
                        {deployedRelease
                          ? `v${deployedRelease.version}`
                          : 'Unknown'}
                      </span>
                      {current ? (
                        <Badge className='bg-emerald-500/10 text-emerald-700'>
                          Current
                        </Badge>
                      ) : null}
                    </div>
                    {deployedRelease ? (
                      <div className='mt-0.5 font-mono text-[11px] text-muted-foreground'>
                        {deployedRelease.checksum.slice(0, 12)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className='py-3'>
                    <DeploymentId value={deployment.id} />
                    <div className='mt-0.5 text-xs text-muted-foreground'>
                      {deployment.kind === 'rollback'
                        ? 'Rolled back'
                        : 'Deployed'}
                    </div>
                  </TableCell>
                  <TableCell className='py-3'>
                    <DeploymentStatus deployment={deployment} />
                  </TableCell>
                  <TableCell className='whitespace-nowrap py-3 text-sm text-muted-foreground tabular-nums'>
                    {formatDateTime(deployment.createdAt)}
                  </TableCell>
                  <TableCell className='py-3 text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label={`Actions for deployment ${shortId(deployment.id)}`}
                            className='size-8 text-muted-foreground'
                            size='icon'
                            variant='ghost'
                          >
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align='end' className='w-40'>
                        <DropdownMenuItem
                          disabled={
                            busy || deployment.status !== 'succeeded' || current
                          }
                          onClick={() => onRollback(deployment.id)}
                        >
                          <RotateCcw />
                          Roll back
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function DeploymentId({
  value,
}: {
  readonly value: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <Button
      aria-label='Copy deployment ID'
      className='group/deployment-id h-auto cursor-copy gap-1 rounded-none p-0 text-sm font-medium tabular-nums hover:bg-transparent hover:text-primary [&_svg]:size-3.5'
      onClick={() => void copy()}
      variant='ghost'
    >
      {shortId(value)}
      {copied ? (
        <ClipboardCheck className='text-muted-foreground' />
      ) : (
        <Clipboard className='opacity-0 transition-opacity group-hover/deployment-id:opacity-100 group-focus-visible/deployment-id:opacity-100' />
      )}
    </Button>
  );
}

export function DeploymentStatus({
  deployment,
}: {
  readonly deployment: DeploymentRecord;
}): ReactElement {
  if (deployment.status === 'deploying') {
    return (
      <Badge
        className='gap-1.5 whitespace-nowrap bg-amber-500/10 text-amber-700'
        role='status'
      >
        <span className='size-1.5 rounded-full bg-amber-500' />
        {deploymentPhaseLabel(deployment.phase)}
      </Badge>
    );
  }
  return (
    <div className='space-y-1'>
      <div className='flex items-center gap-2'>
        <StatusBadge state={deployment.status} />
        {deployment.cacheHit ? (
          <Badge className='bg-sky-500/10 text-sky-700 dark:text-sky-300'>
            Cache reused
          </Badge>
        ) : null}
      </div>
      {deployment.error ? <DeploymentError message={deployment.error} /> : null}
    </div>
  );
}

export function DeploymentError({
  message,
}: {
  readonly message: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className='mt-1 flex max-w-80 items-center gap-1'>
      <Button
        className='h-6 min-w-0 flex-1 justify-start px-1 text-xs text-destructive hover:text-destructive'
        onClick={() => setOpen(true)}
        title={message}
        variant='ghost'
      >
        <span className='truncate'>{message}</span>
      </Button>
      <Button
        aria-label='Copy deployment error'
        className='size-6 shrink-0 text-destructive hover:text-destructive'
        onClick={() => void copy()}
        size='icon'
        title={copied ? 'Copied' : 'Copy error'}
        variant='ghost'
      >
        {copied ? <ClipboardCheck /> : <Clipboard />}
      </Button>
      {open ? (
        <AppDialog
          title='Deployment error'
          description='The deployment did not complete successfully.'
          onClose={() => setOpen(false)}
          wide
        >
          <pre className='max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-red-200'>
            {message}
          </pre>
          <div className='mt-5 flex justify-end gap-2'>
            <Button onClick={() => setOpen(false)} variant='outline'>
              Close
            </Button>
            <Button onClick={() => void copy()}>
              {copied ? <ClipboardCheck /> : <Clipboard />}
              {copied ? 'Copied' : 'Copy error'}
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </div>
  );
}
