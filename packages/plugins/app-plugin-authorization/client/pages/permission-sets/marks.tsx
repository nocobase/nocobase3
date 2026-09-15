import { Check, Contrast, Minus, Shield } from 'lucide-react';
import type { ReactElement } from 'react';

import { useAuthorizationTranslation } from '../../i18n.js';
import { markDescription, markLabel, type GrantMark } from './labels.js';

const markStyles: Readonly<Record<GrantMark, string>> = {
  all: 'bg-primary/10 text-primary',
  scoped: 'bg-muted text-foreground',
  none: 'text-muted-foreground/60',
  bypass: 'bg-primary/10 text-primary',
};

const markIcons = {
  all: Check,
  scoped: Contrast,
  none: Minus,
  bypass: Shield,
} as const;

export function ScopeMark({ value }: { value: GrantMark }): ReactElement {
  const t = useAuthorizationTranslation();
  const Icon = markIcons[value];
  return (
    <span
      aria-label={markLabel(t, value)}
      className={`inline-grid size-6 place-items-center rounded-md ${markStyles[value]}`}
      role='img'
      title={markDescription(t, value)}
    >
      <Icon className='size-3.5' />
    </span>
  );
}

export function ScopeLegend({
  values,
}: {
  values: readonly GrantMark[];
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
      {values.map((value) => (
        <span key={value} className='flex items-center gap-2'>
          <ScopeMark value={value} />
          {markDescription(t, value)}
        </span>
      ))}
    </div>
  );
}
