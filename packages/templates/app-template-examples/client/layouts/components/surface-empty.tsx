import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import type { ReactElement } from 'react';
export interface SurfaceCopy {
  /** Labels the navigation landmark and the loading state, such as `Settings` or `Dev tools`. */
  readonly title: string;
  /** The path this surface mounts at, used to strip the prefix from nested route paths. */
  readonly pathPrefix: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

export function SurfaceEmpty({
  copy,
}: {
  readonly copy: SurfaceCopy;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <main className='grid min-h-svh place-items-center px-6'>
      <section className='w-full max-w-lg space-y-3 text-center'>
        <h1 className='text-xl font-semibold'>{copy.emptyTitle}</h1>
        <p className='text-sm text-muted-foreground'>{copy.emptyDescription}</p>
        <Link
          className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
          to='/'
        >
          <ArrowLeft className='size-4' />
          {t('surface.backToApp', { defaultValue: 'Back to app' })}
        </Link>
      </section>
    </main>
  );
}
