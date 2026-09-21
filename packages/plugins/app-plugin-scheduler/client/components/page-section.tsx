import { twMerge } from 'tailwind-merge';
import type { ComponentProps, ReactElement } from 'react';

export type PageSectionProps = ComponentProps<'section'>;

/** The bordered surface section content sits in, matching the card treatment the other modules use. */
export function PageSection({
  className,
  ...props
}: PageSectionProps): ReactElement {
  return (
    <section
      className={twMerge(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
