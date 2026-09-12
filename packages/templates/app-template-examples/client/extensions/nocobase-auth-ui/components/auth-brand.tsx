import type { ReactElement, ReactNode } from 'react';

export interface AuthBrandProps {
  readonly light?: ReactNode;
  readonly dark?: ReactNode;
  readonly name?: ReactNode;
}

export function AuthBrand({
  light,
  dark,
  name = 'NocoBase',
}: AuthBrandProps): ReactElement {
  return (
    <div
      aria-label={typeof name === 'string' ? name : undefined}
      className='flex min-h-10 w-full items-center justify-start'
      role='img'
    >
      <span className='dark:hidden'>{light ?? name}</span>
      <span className='hidden dark:block'>{dark ?? light ?? name}</span>
    </div>
  );
}
