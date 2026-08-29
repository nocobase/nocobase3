import { useOptionalI18nRuntime } from '@nocobase/app-i18n/client';
import type { ChangeEvent, ReactElement } from 'react';

import { useAppLocale } from './use-locale.js';

export interface LanguageSwitcherProps {
  readonly className?: string;
  /** Accessible name for the control. Defaults to "Language". */
  readonly label?: string;
}

/**
 * An unstyled language picker.
 *
 * It ships as a plain `select` on purpose: the plugin owns the switching behaviour, while how it looks belongs to the
 * application, which can restyle it through `className` or build its own control on `useAppLocale`.
 */
export function LanguageSwitcher(
  props: LanguageSwitcherProps,
): ReactElement | null {
  // Rendering nothing without a runtime keeps the switcher droppable into any tree, including one an application
  // composes before i18n is mounted. The hooks below need a runtime, so the check has to happen before them.
  const runtime = useOptionalI18nRuntime();
  if (!runtime) return null;

  return <LocalePicker {...props} />;
}

function LocalePicker({
  className,
  label = 'Language',
}: LanguageSwitcherProps): ReactElement | null {
  const { locale, locales, setLocale, switching } = useAppLocale();

  // With one language there is nothing to choose.
  if (locales.length < 2) return null;

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    void setLocale(event.target.value);
  };

  return (
    <select
      aria-label={label}
      className={className}
      disabled={switching}
      onChange={handleChange}
      value={locale}
    >
      {locales.map((definition) => (
        <option key={definition.locale} value={definition.locale}>
          {definition.label}
        </option>
      ))}
    </select>
  );
}
