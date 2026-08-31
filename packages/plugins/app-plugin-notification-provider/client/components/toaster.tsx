import type { CSSProperties, ReactElement } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export type { ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps = {}): ReactElement {
  return (
    <Sonner
      theme='system'
      className='toaster group'
      style={
        {
          '--normal-bg': 'var(--popover, var(--background))',
          '--normal-text': 'var(--popover-foreground, var(--foreground))',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      {...props}
    />
  );
}
