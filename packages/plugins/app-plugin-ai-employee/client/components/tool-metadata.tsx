import type { ReactElement } from 'react';
import { Badge } from '../../registry/nocobase-ai/shared/ui/badge.js';
import { useT } from '../locales/index.js';
import type { ManagedToolSummary } from '../tools-management-service.js';

export function ToolMetadata({
  tool,
}: {
  tool: ManagedToolSummary;
}): ReactElement {
  const t = useT();
  return (
    <dl className='flex min-w-0 flex-wrap gap-3 text-xs'>
      {(['scope', 'source'] as const).map((field) =>
        tool[field] ? (
          <div
            key={field}
            className='flex min-w-0 max-w-full flex-wrap items-center gap-2'
          >
            <dt className='text-muted-foreground'>{t(`tools.${field}`)}</dt>
            <dd className='min-w-0 max-w-full'>
              <Badge
                variant='secondary'
                translate='no'
                className='h-auto max-w-full whitespace-normal break-all'
              >
                {tool[field]}
              </Badge>
            </dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
