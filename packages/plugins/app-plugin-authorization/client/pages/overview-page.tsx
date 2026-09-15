import { resolveAppUrl } from '@nocobase/app-client';
import type { ReactElement } from 'react';

import { PermissionsPage } from '../components/page-shell.js';
import { Badge } from '../components/ui/badge.js';

/** What a layer does to a request: it grants an action, or it changes which records that action reaches. */
type LayerDirection = 'grants' | 'widens' | 'narrows';

interface Layer {
  readonly page: string;
  readonly title: string;
  readonly direction: LayerDirection;
  /** One sentence on what the layer does. */
  readonly summary: string;
  /** One line on what it cannot do, which is what keeps the layers apart. */
  readonly limit: string;
}

const directionLabels: Readonly<Record<LayerDirection, string>> = {
  grants: 'Grants',
  widens: 'Widens records',
  narrows: 'Narrows records',
};

const directionStyles: Readonly<Record<LayerDirection, string>> = {
  grants: 'bg-primary/10 text-primary',
  widens: 'bg-muted text-foreground',
  narrows: 'bg-destructive/10 text-destructive',
};

/** The four layers in the order a request is decided. */
const layers: readonly Layer[] = [
  {
    page: 'permission-sets',
    title: 'Permission Sets',
    direction: 'grants',
    summary:
      'What a person may do at all: the actions on a resource, the fields, and the records each action starts from.',
    limit: 'Without a grant here, no rule below can let a request through.',
  },
  {
    page: 'default-access',
    title: 'Default Access',
    direction: 'widens',
    summary:
      'A baseline for everyone, adding records to an action a set already permits.',
    limit:
      'Collections only. A baseline selects records, and pages and settings have none.',
  },
  {
    page: 'sharing-rules',
    title: 'Sharing Rules',
    direction: 'widens',
    summary:
      'The same widening, addressed to chosen subjects instead of to everyone.',
    limit: "Never grants an action the holder's sets did not already permit.",
  },
  {
    page: 'restriction-rules',
    title: 'Restriction Rules',
    direction: 'narrows',
    summary:
      'The only layer that takes away. Applied last, it removes records the layers above allowed.',
    limit: 'Applies to holders of unrestricted access too.',
  },
];

export default function AuthorizationOverviewPage(): ReactElement {
  return (
    <PermissionsPage
      title='Authorization'
      description='Four layers decide every request, in this order. A permission set grants access; the rules after it only change which records that access reaches.'
    >
      <ol className='space-y-2.5'>
        {layers.map((layer, index) => (
          <li key={layer.page}>
            <a
              className='flex items-start gap-4 rounded-xl border bg-card px-4 py-4 text-card-foreground shadow-sm hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
              href={resolveAppUrl(`settings/authorization/${layer.page}`)}
            >
              <span className='mt-0.5 font-mono text-xs text-muted-foreground tabular-nums'>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block font-medium'>{layer.title}</span>
                <span className='mt-1 block max-w-prose text-sm text-muted-foreground'>
                  {layer.summary}
                </span>
                <span className='mt-2 block max-w-prose text-xs text-muted-foreground'>
                  {layer.limit}
                </span>
              </span>
              <Badge className={directionStyles[layer.direction]}>
                {directionLabels[layer.direction]}
              </Badge>
            </a>
          </li>
        ))}
      </ol>
    </PermissionsPage>
  );
}
