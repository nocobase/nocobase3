import { useTranslation } from '@nocobase/i18n/client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * The header's color-mode control.
 *
 * It shows the mode in effect and switches to the opposite explicit mode, so a browser following the system stops
 * following it on the first click. Choosing a theme is a separate, longer-lived decision and lives on the Settings
 * theme page; this stays here because switching light and dark is an everyday action.
 *
 * The tooltip provider is local so the control works where the header is not — the standalone pages render it on its
 * own — and nesting it inside the header's provider is harmless.
 */
export function ThemeModeToggle(): ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const label = t('appearance.toggle', {
    defaultValue: 'Switch between light and dark',
  });
  const dark = resolvedTheme === 'dark';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              className='size-10 rounded-xl border-border/70 bg-background/60 hover:bg-accent/50'
              onClick={() => setTheme(dark ? 'light' : 'dark')}
              size='icon'
              variant='outline'
            />
          }
        >
          {dark ? (
            <Moon aria-hidden='true' className='size-5' />
          ) : (
            <Sun aria-hidden='true' className='size-5' />
          )}
        </TooltipTrigger>
        <TooltipContent side='bottom'>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
