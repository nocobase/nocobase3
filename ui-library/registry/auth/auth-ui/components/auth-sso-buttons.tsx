import type { ReactElement, ReactNode } from 'react';

export interface AuthSsoProvider {
  readonly disabled?: boolean;
  readonly href?: string;
  readonly icon?: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
  readonly onClick?: () => void;
}

export interface AuthSsoButtonsProps {
  readonly label?: ReactNode;
  readonly providers: readonly AuthSsoProvider[];
}

export function AuthSsoButtons({
  label = 'Or continue with',
  providers,
}: AuthSsoButtonsProps): ReactElement {
  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-3 text-xs text-muted-foreground'>
        <span className='h-px flex-1 bg-border' />
        <span>{label}</span>
        <span className='h-px flex-1 bg-border' />
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        {providers.map((provider) => {
          const className =
            'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';
          const content = (
            <>
              {provider.icon ? (
                <span
                  aria-hidden='true'
                  className='grid size-4 place-items-center'
                >
                  {provider.icon}
                </span>
              ) : null}
              <span>{provider.label}</span>
            </>
          );

          if (provider.href) {
            return (
              <a className={className} href={provider.href} key={provider.id}>
                {content}
              </a>
            );
          }

          return (
            <button
              className={className}
              disabled={provider.disabled}
              key={provider.id}
              onClick={provider.onClick}
              type='button'
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
