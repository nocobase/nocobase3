import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import { AlertCircle, Check, Copy, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getDeployTokenForCommand,
  readRememberedDeployToken,
} from './deploy-token';

interface DevelopmentGuideDialogProps {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DevelopmentGuideDialog({
  appId,
  open,
  onOpenChange,
}: DevelopmentGuideDialogProps) {
  const [deployToken, setDeployToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);

  useEffect(() => {
    if (!open) return;
    const remembered = readRememberedDeployToken(appId);
    if (remembered) {
      setDeployToken(remembered);
      setTokenError(false);
      return;
    }

    let active = true;
    setDeployToken(null);
    setTokenError(false);
    void getDeployTokenForCommand(appId).then(
      (token) => {
        if (active) setDeployToken(token);
      },
      () => {
        if (active) setTokenError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [appId, open, retryGeneration]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>本地开发与部署</DialogTitle>
          <DialogDescription>
            App ID：<span className='font-mono text-foreground'>{appId}</span>
          </DialogDescription>
        </DialogHeader>

        {deployToken ? (
          <DevelopmentGuideSteps appId={appId} deployToken={deployToken} />
        ) : tokenError ? (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>无法生成部署命令</AlertTitle>
            <AlertDescription className='space-y-3'>
              <p>Hub 暂时无法生成部署令牌，请稍后重试。</p>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => setRetryGeneration((value) => value + 1)}
              >
                重试
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <LoaderCircle className='animate-spin' />
            <AlertTitle>正在生成部署命令</AlertTitle>
            <AlertDescription>Hub 正在准备部署令牌。</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type='button' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DevelopmentGuideSteps({
  appId,
  deployToken,
}: {
  appId: string;
  deployToken: string;
}) {
  const localCommands = [
    'pnpm config set @nocobase:registry https://npm.nocobase.ai/',
    `pnpm create @nocobase/app@latest ${appId}`,
    `cd ${appId}`,
    'pnpm dev',
  ].join('\n');
  const hubUrl = resolveCurrentHubUrl();
  const deployCommand = `pnpm run deploy --hub ${hubUrl} --token ${deployToken}`;

  return (
    <div className='space-y-4'>
      <CommandBlock
        title='1. 创建并启动本地应用'
        command={localCommands}
        copyLabel='复制开发命令'
      />
      <CommandBlock
        title='2. 构建并部署到 Hub'
        description='复制后在本地 App 根目录直接执行。部署会上传构建产物并提交审批。'
        command={deployCommand}
        copyLabel='复制部署命令'
      />
    </div>
  );
}

function CommandBlock({
  title,
  description,
  command,
  copyLabel,
}: {
  title: string;
  description?: string;
  command: string;
  copyLabel: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );

  return (
    <section className='overflow-hidden rounded-xl border bg-card'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
        <div className='min-w-0'>
          <h3 className='font-medium'>{title}</h3>
          {description ? (
            <p className='mt-1 text-xs leading-5 text-muted-foreground'>
              {description}
            </p>
          ) : null}
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => void copyText(command, setCopyState)}
        >
          {copyState === 'copied' ? <Check /> : <Copy />}
          {copyState === 'copied' ? '已复制' : copyLabel}
        </Button>
      </div>
      {copyState === 'error' ? (
        <p role='alert' className='border-b px-4 py-2 text-xs text-destructive'>
          无法访问剪贴板，请手动选择并复制命令。
        </p>
      ) : null}
      <pre className='overflow-x-auto whitespace-pre-wrap bg-muted/30 p-4 font-mono text-xs leading-5 text-foreground'>
        {command}
      </pre>
    </section>
  );
}

async function copyText(
  value: string,
  setState: (state: 'idle' | 'copied' | 'error') => void,
): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    setState('copied');
  } catch {
    setState('error');
  }
}

function resolveCurrentHubUrl(): string {
  if (typeof window === 'undefined') return getPortalBase().replace(/\/+$/, '');
  return `${window.location.origin}${getPortalBase().replace(/\/+$/, '')}`;
}
