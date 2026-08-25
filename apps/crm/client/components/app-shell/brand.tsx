import { ChartNoAxesCombined } from 'lucide-react';

import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
};

type BrandWordmarkProps = BrandLogoProps & {
  subtitle?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      <ChartNoAxesCombined className='size-5' aria-hidden='true' />
    </span>
  );
}

export function BrandWordmark({
  className,
  subtitle = 'Agent-built sales workspace',
}: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2.5 overflow-hidden',
        className,
      )}
    >
      <BrandLogo className='size-9 rounded-lg' />
      <span className='min-w-0 leading-tight'>
        <span className='block truncate text-sm font-semibold tracking-tight'>
          NocoBase CRM
        </span>
        <span className='block truncate text-[11px] text-muted-foreground'>
          {subtitle}
        </span>
      </span>
    </span>
  );
}
type BrandProps = {
  className?: string;
  logoClassName?: string;
  showText?: boolean;
  subtitle?: string;
};

export function Brand({
  className,
  logoClassName,
  showText = true,
  subtitle,
}: BrandProps) {
  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      {showText ? (
        <BrandWordmark className={logoClassName} subtitle={subtitle} />
      ) : (
        <BrandLogo className={logoClassName} />
      )}
    </div>
  );
}
