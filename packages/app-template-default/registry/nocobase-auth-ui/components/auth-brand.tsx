import type { ReactElement } from 'react';

export function AuthBrand(): ReactElement {
  return (
    <div
      aria-label='NocoBase Default App'
      className='flex items-center gap-3'
      role='img'
    >
      <svg
        aria-hidden='true'
        className='size-10 shrink-0 text-foreground'
        fill='none'
        viewBox='0 0 40 40'
      >
        <path
          d='m20 3 14 8v16l-14 8-14-8V11l14-8Z'
          fill='currentColor'
          opacity='.12'
        />
        <path
          d='m20 3 14 8-14 8L6 11l14-8Zm0 16v16m14-24v16l-14 8-14-8V11'
          stroke='currentColor'
          strokeLinejoin='round'
          strokeWidth='2.5'
        />
      </svg>
      <span className='text-2xl font-semibold tracking-[-0.04em]'>
        NocoBase
      </span>
    </div>
  );
}
