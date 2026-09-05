import { Palette } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from '@nocobase/i18n/client';
import { useId, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { useThemePreset } from './theme-context';
import { themePresets } from './theme-presets';

export function ThemeSettings(): ReactElement {
  const { theme, setTheme } = useTheme();
  const { preset, setPreset } = useThemePreset();
  const { t } = useTranslation();
  const id = useId();
  const title = t('appearance.title', { defaultValue: 'Appearance' });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={title}
            title={title}
            size='icon'
            variant='outline'
            className='size-10 rounded-xl border-border/70 bg-background/60'
          />
        }
      >
        <Palette aria-hidden='true' className='size-5' />
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-80 max-w-[calc(100vw-2rem)] space-y-4'
      >
        <PopoverTitle>{title}</PopoverTitle>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>
            {t('appearance.mode', { defaultValue: 'Color mode' })}
          </legend>
          <div className='grid grid-cols-3 gap-2'>
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <label
                key={mode}
                className='flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 py-3 text-xs has-[:checked]:border-primary'
              >
                <input
                  type='radio'
                  name={id + '-mode'}
                  value={mode}
                  checked={theme === mode}
                  onChange={() => setTheme(mode)}
                />
                {t('appearance.' + mode, {
                  defaultValue: mode[0].toUpperCase() + mode.slice(1),
                })}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>
            {t('appearance.preset', { defaultValue: 'Theme' })}
          </legend>
          <div className='grid grid-cols-2 gap-2'>
            {themePresets.map((item) => (
              <label
                key={item.id}
                className='cursor-pointer rounded-lg border p-2 has-[:checked]:border-primary'
              >
                <div
                  aria-hidden='true'
                  data-theme={item.id}
                  className='theme-preview mb-2 flex h-16 gap-2 rounded border border-border bg-background p-2'
                >
                  <div className='w-5 rounded bg-muted' />
                  <div className='flex-1 space-y-2'>
                    <div className='h-2 rounded bg-foreground' />
                    <div className='h-2 rounded bg-muted' />
                    <div className='h-4 w-8 rounded bg-primary' />
                  </div>
                </div>
                <span className='flex items-center gap-2 text-sm'>
                  <input
                    type='radio'
                    name={id + '-preset'}
                    checked={preset === item.id}
                    onChange={() => setPreset(item.id)}
                  />
                  {t(item.labelKey, {
                    defaultValue:
                      item.id.charAt(0).toUpperCase() + item.id.slice(1),
                  })}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
