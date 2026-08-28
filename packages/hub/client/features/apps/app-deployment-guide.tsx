import { Check, Copy, Terminal } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface AppDeploymentGuideProps {
  appId?: string;
  embedded?: boolean;
}

export function AppDeploymentGuide(props: AppDeploymentGuideProps) {
  const appId = props.appId ?? 'my-app';
  const isExample = !props.appId;
  const [copied, setCopied] = useState<'create' | 'existing' | null>(null);
  const targetUrl = deploymentTargetUrl(appId);
  const existingTargetUrl = deploymentTargetUrl(
    props.appId ? appId : 'your-app-id',
  );
  const createCommands = [
    `pnpm --config.registry=https://npm.nocobase.ai create @nocobase/app@latest ${appId}`,
    `cd ${appId}`,
    'pnpm dev',
    `pnpm run deploy --hub ${targetUrl}`,
  ].join('\n');
  const existingCommands = [
    'cd /path/to/your-app',
    `pnpm run deploy --hub ${existingTargetUrl}`,
  ].join('\n');

  const copyCommands = async (
    kind: 'create' | 'existing',
    commands: string,
  ): Promise<void> => {
    try {
      await navigator.clipboard.writeText(commands);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const guide = (
    <div className={cn('min-w-0 w-full', !props.embedded && 'max-w-2xl')}>
      {isExample ? (
        <p className='mb-4 text-center text-xs leading-5 text-muted-foreground'>
          以下为示例命令，可复制后按实际 App 名称、ID 和本地路径修改。
        </p>
      ) : null}
      <Tabs defaultValue='create' className='min-w-0'>
        <TabsList className='mx-auto grid h-auto w-full max-w-md grid-cols-2'>
          <TabsTrigger value='create' className='py-1.5'>
            还没有本地 App
          </TabsTrigger>
          <TabsTrigger value='existing' className='py-1.5'>
            已有本地 App
          </TabsTrigger>
        </TabsList>
        <TabsContent value='create' className='mt-4 min-w-0 space-y-3'>
          <CommandBlock
            commands={createCommands}
            copied={copied === 'create'}
            onCopy={() => void copyCommands('create', createCommands)}
          />
          <p className='text-xs leading-5 text-muted-foreground'>
            <code className='font-mono'>pnpm dev</code>{' '}
            用于本地验证；确认无误后可在另一个终端执行最后一行部署。
          </p>
        </TabsContent>
        <TabsContent value='existing' className='mt-4 min-w-0 space-y-3'>
          <CommandBlock
            commands={existingCommands}
            copied={copied === 'existing'}
            onCopy={() => void copyCommands('existing', existingCommands)}
          />
          <p className='text-xs leading-5 text-muted-foreground'>
            {isExample ? (
              <>
                请将 URL 中的 <code className='font-mono'>your-app-id</code>{' '}
                替换为本地 App 的 ID，并在源码目录执行。
              </>
            ) : (
              <>请将本地路径替换为实际源码目录后执行。</>
            )}
            首次合法产物上传成功后，Hub 会自动登记该 App。
          </p>
        </TabsContent>
      </Tabs>
      <p className='mt-4 text-xs leading-5 text-muted-foreground'>
        当前部署接口需要 Token，请先按管理员提供的信息设置{' '}
        <code className='font-mono'>NOCOBASE_HUB_TOKEN</code>。源码仍由本地
        Git、GitHub 或 GitLab 管理，不会上传到 Hub。
      </p>
    </div>
  );

  if (props.embedded) {
    return guide;
  }

  return (
    <Card className='border-dashed'>
      <CardHeader className='text-center'>
        <div className='mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground'>
          <Terminal />
        </div>
        <CardTitle className='mt-2'>部署 App 到 Hub</CardTitle>
        <p className='mx-auto max-w-xl text-sm leading-6 text-muted-foreground'>
          App 在本地开发，Hub 只接收构建产物。选择你当前的情况继续。
        </p>
      </CardHeader>
      <CardContent className='mx-auto w-full max-w-2xl'>{guide}</CardContent>
    </Card>
  );
}

function CommandBlock({
  commands,
  copied,
  onCopy,
}: {
  commands: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className='relative min-w-0 max-w-full'>
      <pre className='w-full max-w-full overflow-x-auto rounded-lg bg-muted/70 p-4 pr-28 font-mono text-xs leading-6'>
        <code>{commands}</code>
      </pre>
      <Button
        variant='outline'
        size='sm'
        className='absolute right-2 top-2 bg-background/90'
        onClick={onCopy}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? '已复制' : '复制命令'}
      </Button>
    </div>
  );
}

export function deploymentTargetUrl(appId: string): string {
  const origin =
    typeof window === 'undefined'
      ? 'http://localhost:3000'
      : window.location.origin;
  return `${origin}/${encodeURIComponent(appId)}`;
}
