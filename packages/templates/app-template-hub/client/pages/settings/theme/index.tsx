import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { useThemePreset } from '@/theme/index';
import { themePresets } from '@/theme/theme-presets';

import { ThemePreviewCard } from './theme-preview-card.js';

/**
 * Application theme settings.
 *
 * A registry with dozens of presets is the case this page is shaped for: the cards wrap into as many columns as the
 * window affords and the page scrolls, rather than the list being cut down to what happens to fit.
 */
export default function ThemePage(): ReactElement {
  const { preset, setPreset } = useThemePreset();
  const { t } = useTranslation();
  const groupId = useId();
  const [query, setQuery] = useState('');
  const title = t('appearance.theme.title', { defaultValue: 'Theme' });
  const search = t('appearance.theme.search', {
    defaultValue: 'Search themes',
  });
  const needle = query.trim().toLowerCase();
  const visible = themePresets.filter(({ id, labelKey }) =>
    needle === ''
      ? true
      : id.toLowerCase().includes(needle) ||
        t(labelKey, { defaultValue: id }).toLowerCase().includes(needle),
  );
  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={t('appearance.theme.description', {
          defaultValue:
            'Choose the theme this application uses. Light and dark are switched from the header.',
        })}
        actions={
          <div className='relative w-full sm:w-64'>
            <Search
              aria-hidden='true'
              className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            />
            <Input
              aria-label={search}
              className='pl-9'
              onChange={(event) => setQuery(event.target.value)}
              placeholder={search}
              type='search'
              value={query}
            />
          </div>
        }
      />
      {visible.length > 0 ? (
        <div
          aria-label={title}
          className='grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3 sm:gap-4'
          role='radiogroup'
        >
          {visible.map(({ id, labelKey }) => (
            <ThemePreviewCard
              key={id}
              id={id}
              label={t(labelKey, { defaultValue: id })}
              name={groupId}
              onSelect={() => setPreset(id)}
              selected={preset === id}
            />
          ))}
        </div>
      ) : (
        <p
          role='status'
          className='rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground'
        >
          {t('appearance.theme.empty', {
            defaultValue: 'No theme matches “{{query}}”.',
            query: query.trim(),
          })}
        </p>
      )}
    </PageContainer>
  );
}
