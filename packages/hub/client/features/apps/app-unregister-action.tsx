import { useState } from 'react';
import { Trash2 } from 'lucide-react';

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

export interface AppUnregisterActionProps {
  appName: string;
  busy: boolean;
  onConfirm: () => void;
  size?: 'sm' | 'default';
}

export function AppUnregisterAction({
  appName,
  busy,
  onConfirm,
  size = 'default',
}: AppUnregisterActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant='destructive'
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Trash2 /> 取消登记
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>确认取消登记</AlertDialogTitle>
            <AlertDialogDescription>
              {appName} 将从 Hub
              应用清单中移除。本地源码、数据库和文件不会被删除；
              已提交构建产物或产生运行记录后不允许执行此操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>保留应用</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={busy}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              <Trash2 /> 确认取消登记
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
