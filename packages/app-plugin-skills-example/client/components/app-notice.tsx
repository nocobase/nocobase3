import type { ReactElement } from 'react';

export interface AppNoticeProps {
  readonly description?: string;
  readonly title: string;
  readonly tone?: 'info' | 'success' | 'warning';
}

const toneClasses: Record<NonNullable<AppNoticeProps['tone']>, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  success: 'border-green-200 bg-green-50 text-green-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
};

export function AppNotice({
  description,
  title,
  tone = 'info',
}: AppNoticeProps): ReactElement {
  return (
    <aside className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <h2 className='font-semibold'>{title}</h2>
      {description ? <p className='mt-1 text-sm'>{description}</p> : null}
    </aside>
  );
}
