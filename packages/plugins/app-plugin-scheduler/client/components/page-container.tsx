import type { ComponentProps, ReactElement, ReactNode } from 'react';

export interface PageContainerProps extends ComponentProps<'section'> {
  readonly header?: ReactNode;
}

/** Centered, width-constrained application page; the header owns its own surface and divider. */
export function PageContainer({
  header,
  children,
  className = '',
  ...props
}: PageContainerProps): ReactElement {
  return (
    <section
      className={`min-h-[calc(100svh-4rem)] w-full bg-muted/20 ${className}`}
      {...props}
    >
      {header}
      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
        {children}
      </div>
    </section>
  );
}
