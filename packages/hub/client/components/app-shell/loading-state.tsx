import { Loader2 } from 'lucide-react';
import { translate } from '@nocobase/app-portal-sdk/i18n';

import { cn } from '@/lib/utils';

export function LoadingState({
  className,
  fullscreen = false,
}: {
  className?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      role='status'
      className={cn(
        'flex items-center justify-center',
        fullscreen && 'min-h-svh bg-background',
        className,
      )}
    >
      <Loader2 className='size-7 animate-spin text-primary' />
      <span className='sr-only'>{translate('ui.loading', 'Loading')}</span>
    </div>
  );
}
