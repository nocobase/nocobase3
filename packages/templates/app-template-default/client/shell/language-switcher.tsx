import { useAppLocale } from '@nocobase/app-plugin-i18n/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface LanguageSwitcherProps {
  readonly className?: string;
}

/**
 * Picks the application's language.
 *
 * The plugin owns the switch itself — storage, resource loading, telling the server — and this owns how it looks, so
 * the control matches the rest of the application rather than the browser's native select.
 */
export function LanguageSwitcher({
  className,
}: LanguageSwitcherProps): ReactElement | null {
  const { locale, locales, setLocale, switching } = useAppLocale();
  const { t } = useTranslation();

  // With one language there is nothing to choose.
  if (locales.length < 2) return null;

  return (
    <Select
      value={locale}
      onValueChange={(value: unknown) => {
        if (typeof value === 'string' && value !== locale) {
          void setLocale(value);
        }
      }}
      disabled={switching}
    >
      <SelectTrigger
        aria-label={t('actions.language', { defaultValue: 'Language' })}
        className={cn('w-full', className)}
        size='sm'
      >
        {/* Without a formatter the trigger shows the raw value — "zh-CN" rather than the language's own name. */}
        <SelectValue>
          {(value: string | null) =>
            locales.find((definition) => definition.locale === value)?.label ??
            value ??
            ''
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {locales.map((definition) => (
            <SelectItem key={definition.locale} value={definition.locale}>
              {definition.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
