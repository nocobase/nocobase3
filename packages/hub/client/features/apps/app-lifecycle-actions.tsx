import { useState } from 'react';
import { LoaderCircle, Play, Power, RotateCcw } from 'lucide-react';
import type {
  AppLifecycleAction,
  AppReleaseOverview,
} from '@nocobase/hub-release-management/types';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface AppLifecycleActionsProps {
  app: AppReleaseOverview;
  busy: boolean;
  onExecute: (action: AppLifecycleAction) => void;
  compact?: boolean;
}

export function AppLifecycleActions({
  app,
  busy,
  onExecute,
  compact = false,
}: AppLifecycleActionsProps) {
  const [pendingAction, setPendingAction] = useState<AppLifecycleAction | null>(
    null,
  );
  const stopped = app.desiredState === 'stopped';
  const transitioning =
    app.runtimeState === 'starting' || app.runtimeState === 'stopping';

  if (stopped) {
    return (
      <Button
        size={compact ? 'sm' : 'default'}
        disabled={busy || transitioning}
        onClick={() => onExecute('start')}
      >
        {busy || transitioning ? (
          <LoaderCircle className='animate-spin' />
        ) : (
          <Play />
        )}
        启动 App
      </Button>
    );
  }

  return (
    <>
      <Button
        size={compact ? 'sm' : 'default'}
        variant='outline'
        disabled={busy || transitioning}
        onClick={() => setPendingAction('restart')}
      >
        <RotateCcw /> 重新启动
      </Button>
      <Button
        size={compact ? 'sm' : 'default'}
        variant='destructive'
        disabled={busy || transitioning}
        onClick={() => setPendingAction('stop')}
      >
        <Power /> 停止运行
      </Button>
      <LifecycleConfirmation
        appName={app.name}
        action={pendingAction}
        busy={busy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          onExecute(pendingAction);
          setPendingAction(null);
        }}
      />
    </>
  );
}

function LifecycleConfirmation({
  appName,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  appName: string;
  action: AppLifecycleAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const stopping = action === 'stop';
  return (
    <AlertDialog
      open={Boolean(action)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            {stopping ? <Power /> : <RotateCcw />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {stopping ? '确认停止 App' : '确认重新启动 App'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {stopping
              ? `${appName} 停止后将无法访问，也不会因访问被自动启动。当前版本、数据和配置都会保留。`
              : `${appName} 会短暂中断服务，并使用当前在线版本重新加载。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant={stopping ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {stopping ? <Power /> : <RotateCcw />}
            {stopping ? '确认停止' : '确认重启'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
