import { Check, Contrast, Minus, Shield } from 'lucide-react';
import type { ReactElement } from 'react';

import { markDescriptions, markLabels, type GrantMark } from './labels.js';

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

export function ScopeMark({
  value,
  context,
}: {
  value: GrantMark;
  /**
   * What the mark stands for where no column header names it, such as the
   * action in a fixed row of marks. It reaches the label and the tooltip, so
   * the row stays the same width whatever the action is called.
   */
  context?: string;
}): ReactElement {
  const Icon = markIcons[value];
  const prefix = context === undefined ? '' : `${context}: `;
  return (
    <span
      aria-label={`${prefix}${markLabels[value]}`}
      className={`inline-grid size-6 place-items-center rounded-md ${markStyles[value]}`}
      role='img'
      title={`${prefix}${markDescriptions[value]}`}
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
  return (
    <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
      {values.map((value) => (
        <span key={value} className='flex items-center gap-2'>
          <ScopeMark value={value} />
          {markDescriptions[value]}
        </span>
      ))}
    </div>
  );
}
