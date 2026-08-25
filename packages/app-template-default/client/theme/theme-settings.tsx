import { useTheme } from 'next-themes';
import type { ChangeEvent, ReactElement } from 'react';

export function ThemeSettings(): ReactElement {
  const { setTheme, theme } = useTheme();

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setTheme(event.target.value);
  };

  return (
    <label className='flex items-center gap-2 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-sm text-foreground shadow-sm backdrop-blur-sm'>
      <span className='sr-only'>Theme</span>
      <select
        aria-label='Theme'
        className='cursor-pointer bg-transparent outline-none'
        value={theme ?? 'system'}
        onChange={handleThemeChange}
      >
        <option value='system'>System</option>
        <option value='light'>Light</option>
        <option value='dark'>Dark</option>
      </select>
    </label>
  );
}
