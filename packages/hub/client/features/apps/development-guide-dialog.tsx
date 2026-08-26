import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import { Check, Copy, Terminal } from 'lucide-react';
import { useState } from 'react';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>本地开发与部署</DialogTitle>
          <DialogDescription>
            App ID：<span className='font-mono text-foreground'>{appId}</span>
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Terminal />
          <AlertTitle>部署令牌不会再次显示</AlertTitle>
          <AlertDescription>
            这里仅提供不含敏感信息的命令。部署时请从密码管理器或 CI Secret
            取出创建应用时保存的令牌，并按终端提示粘贴。
          </AlertDescription>
        </Alert>

        <DevelopmentGuideSteps appId={appId} />

        <DialogFooter>
          <Button type='button' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DevelopmentGuideSteps({ appId }: { appId: string }) {
  const localCommands = [
    `nb3 app create ${appId}`,
    `cd ${appId}`,
    'pnpm install',
    'nb3 app dev',
  ].join('\n');
  const hubUrl = resolveCurrentHubUrl();
  const deployCommand = `(printf 'Deploy token: '; read -r -s NB3_HUB_TOKEN && export NB3_HUB_TOKEN && printf '\\n' && nb3 app deploy --hub ${quoteForShell(hubUrl)}; NB3_DEPLOY_EXIT=$?; unset NB3_HUB_TOKEN; exit "$NB3_DEPLOY_EXIT")`;

  return (
    <div className='space-y-4'>
      <CommandBlock
        title='1. 创建并启动本地应用'
        command={localCommands}
        copyLabel='复制开发命令'
      />
      <CommandBlock
        title='2. 构建并部署到 Hub'
        description='先运行命令并粘贴部署令牌；输入不会显示，也不会进入 Shell 历史。部署会上传构建产物并提交审批。'
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

function quoteForShell(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
