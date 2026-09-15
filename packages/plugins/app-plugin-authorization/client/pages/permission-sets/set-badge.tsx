import type { ReactElement } from 'react';

import { Badge } from '../../components/ui/badge.js';

/** Whether a set is owned by the application or configured here. */
export function SetBadge({
  tone,
  children,
}: {
  tone: 'neutral' | 'protected';
  children: string;
}): ReactElement {
  return (
    <Badge
      className={
        tone === 'protected'
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      }
    >
      {children}
    </Badge>
  );
}
