import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AppAccessActionsProps {
  accessUrl: string | null;
  className?: string;
  showCopy?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline';
  disabledReason?: string;
}

export function AppAccessActions({
  accessUrl,
  className,
  showCopy = true,
  size = 'default',
  variant = 'default',
  disabledReason,
}: AppAccessActionsProps) {
  if (disabledReason) {
    return (
      <Button className={className} size={size} variant='outline' disabled>
        <ExternalLink /> {disabledReason}
      </Button>
    );
  }
  if (!accessUrl) {
    return (
      <Button className={className} size={size} variant='outline' disabled>
        <ExternalLink /> 尚未上线
      </Button>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        nativeButton={false}
        size={size}
        variant={variant}
        render={<a href={accessUrl} target='_blank' rel='noreferrer' />}
      >
        <ExternalLink /> 打开 App
      </Button>
      {showCopy ? (
        <Button
          size={size}
          variant='outline'
          aria-label='复制 App 地址'
          onClick={() => void copyAccessUrl(accessUrl)}
        >
          <Copy /> 复制地址
        </Button>
      ) : null}
    </div>
  );
}

async function copyAccessUrl(accessUrl: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is unavailable');
    }
    await navigator.clipboard.writeText(accessUrl);
    toast.success('App 地址已复制');
  } catch {
    toast.error('无法复制 App 地址', {
      description: '请直接打开 App 后从浏览器地址栏复制。',
    });
  }
}
