import {
  createContext,
  useContext,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
} from 'react';

import { cn } from '../../lib/utils.js';

const ProgressContext = createContext(0);

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  readonly value?: number | null;
  readonly max?: number;
}

function Progress({
  className,
  children,
  value = 0,
  max = 100,
  ...props
}: ProgressProps): ReactElement {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.min(safeMax, Math.max(0, value ?? 0));
  const percent = (safeValue / safeMax) * 100;

  return (
    <ProgressContext.Provider value={percent}>
      <div
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        data-slot='progress'
        className={cn('flex flex-wrap gap-3', className)}
        {...props}
      >
        {children}
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </div>
    </ProgressContext.Provider>
  );
}

function ProgressTrack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      className={cn(
        'relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted',
        className,
      )}
      data-slot='progress-track'
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  const percent = useContext(ProgressContext);
  return (
    <div
      data-slot='progress-indicator'
      className={cn('h-full bg-primary transition-all', className)}
      style={{ width: `${String(percent)}%`, ...style }}
      {...props}
    />
  );
}

function ProgressLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>): ReactElement {
  return (
    <span
      className={cn('text-sm font-medium', className)}
      data-slot='progress-label'
      {...props}
    />
  );
}

function ProgressValue({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): ReactElement {
  return (
    <span
      className={cn(
        'ml-auto text-sm text-muted-foreground tabular-nums',
        className,
      )}
      data-slot='progress-value'
      {...props}
    />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
};
