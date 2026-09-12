import { Bot } from 'lucide-react';
import type { ReactElement } from 'react';
import { getAIEmployeeAvatar } from './avatars.js';

export interface AIEmployeeAvatarProps {
  src?: string;
  name?: string;
  className?: string;
}

export function AIEmployeeAvatar({
  src,
  name,
  className = 'h-10 w-10',
}: AIEmployeeAvatarProps): ReactElement {
  const classes = `${className} shrink-0 overflow-hidden rounded-full border bg-muted`;
  if (src) {
    return (
      <img
        className={`${classes} object-cover`}
        src={getAIEmployeeAvatar(src)}
        alt={name ?? ''}
      />
    );
  }
  return (
    <span
      className={`${classes} inline-flex items-center justify-center`}
      aria-hidden='true'
    >
      <Bot className='h-1/2 w-1/2 text-muted-foreground' />
    </span>
  );
}
