import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export type PageContainerProps = ComponentProps<'section'>;

export function PageContainer({ className, ...props }: PageContainerProps) {
  return (
    <section
      className={cn('w-full space-y-6 p-6 md:p-8', className)}
      {...props}
    />
  );
}

PageContainer.displayName = 'PageContainer';
