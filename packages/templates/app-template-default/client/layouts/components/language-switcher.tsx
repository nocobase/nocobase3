import { useAppLocale } from '@nocobase/app-plugin-i18n/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Languages } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export interface LanguageSwitcherProps {
  readonly className?: string;
}

/** Account-menu language choices; the plugin owns persistence and resource loading. */
export function LanguageSwitcher({
  className,
}: LanguageSwitcherProps): ReactElement | null {
  const { locale, locales, setLocale, switching } = useAppLocale();
  const { t } = useTranslation();

  async function applyLocaleChange(value: string): Promise<void> {
    const result = await setLocale(value);
    if (result.fallback) {
      toast.add({
        type: 'info',
        title: t('notices.serverLocaleFallback', {
          lng: value,
          defaultValue:
            'The server does not support this language, so server messages will use English.',
        }),
      });
    }
  }

  function handleLocaleChange(value: unknown): void {
    if (typeof value !== 'string' || value === locale) return;

    const localeChange = applyLocaleChange(value);
    localeChange.catch(() => {
      toast.add({
        type: 'error',
        priority: 'high',
        title: t('notices.languageChangeFailed', {
          lng: value,
          defaultValue:
            'Unable to complete the language change. Please try again.',
        }),
      });
    });
  }

  // With one language there is nothing to choose.
  if (locales.length < 2) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className={cn('gap-2', className)}
        disabled={switching}
      >
        <Languages aria-hidden='true' className='size-4' />
        <span className='flex-1'>
          {t('actions.language', { defaultValue: 'Language' })}
        </span>
        <span className='text-muted-foreground'>
          {locales.find((definition) => definition.locale === locale)?.label ??
            locale}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={handleLocaleChange}
        >
          {locales.map((definition) => (
            <DropdownMenuRadioItem
              closeOnClick
              key={definition.locale}
              value={definition.locale}
              disabled={switching}
            >
              {definition.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
