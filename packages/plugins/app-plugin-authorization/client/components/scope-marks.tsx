import { Circle, CircleCheck, Contrast, Shield } from 'lucide-react';
import type { ReactElement } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import {
  markDescription,
  markLabel,
  type GrantMark,
} from '../components/action-labels.js';

const markStyles: Readonly<Record<GrantMark, string>> = {
  all: 'text-primary',
  scoped: 'text-foreground',
  none: 'text-muted-foreground',
  bypass: 'bg-primary/10 text-primary',
};

const markIcons = {
  all: CircleCheck,
  scoped: Contrast,
  none: Circle,
  bypass: Shield,
} as const;

export function ScopeMark({
  value,
  legend = false,
  label,
}: {
  value: GrantMark;
  legend?: boolean;
  label?: string;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const Icon = markIcons[value];
  return (
    <span
      aria-label={label ?? markLabel(t, value)}
      className={`inline-grid size-6 place-items-center rounded-md ${markStyles[value]}`}
      role='img'
      title={label ?? markDescription(t, value)}
    >
      <Icon
        className={
          value === 'bypass' ? 'size-3.5' : legend ? 'size-4.5' : 'size-4'
        }
      />
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
          <ScopeMark value={value} legend />
          {markDescription(t, value)}
        </span>
      ))}
    </div>
  );
}
