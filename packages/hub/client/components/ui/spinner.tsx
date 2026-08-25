import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';
import { translate } from '@nocobase/app-portal-sdk/i18n';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot='spinner'
      role='status'
      aria-label={translate('ui.loading', 'Loading')}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
