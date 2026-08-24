import { resolveAppUrl } from '@nocobase/app-sdk';
import { useGo } from '@refinedev/core';
import type { MouseEvent, PropsWithChildren, ReactElement } from 'react';

export interface AuthLinkProps extends PropsWithChildren {
  readonly className?: string;
  readonly to: string;
}

export function AuthLink({
  children,
  className,
  to,
}: AuthLinkProps): ReactElement {
  const go = useGo();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    go({ to, type: 'push' });
  };

  return (
    <a className={className} href={resolveAppUrl(to)} onClick={handleClick}>
      {children}
    </a>
  );
}
