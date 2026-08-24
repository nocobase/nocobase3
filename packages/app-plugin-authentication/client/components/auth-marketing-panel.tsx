import type { ReactElement, ReactNode } from 'react';

export function AuthMarketingPanel(): ReactElement {
  return (
    <aside
      aria-label='About NocoBase'
      className='relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center'
    >
      <div className='pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
      <div className='relative w-full max-w-xl'>
        <p className='text-xs font-semibold tracking-[0.14em] text-white/55 uppercase'>
          AI-native application platform
        </p>
        <h2 className='mt-3 max-w-lg text-5xl leading-[1.08] font-semibold tracking-[-0.04em]'>
          Let AI build freely. NocoBase keeps it reliable.
        </h2>
        <p className='mt-5 max-w-lg text-base leading-7 text-white/60'>
          Give AI a flexible frontend framework to shape each experience, while
          NocoBase secures the data, permissions, workflows and governance
          underneath.
        </p>

        <div className='mt-10 max-w-md rounded-xl border border-white/15 bg-white p-5 text-neutral-900 shadow-2xl shadow-black/20'>
          <Capability
            description='Compose interfaces freely on a flexible framework.'
            icon={<SparklesIcon />}
            title='AI-native frontend'
          />
          <div className='my-5 h-px bg-neutral-200' />
          <Capability
            description='Reliable data, access control, workflows and governance.'
            icon={<ShieldIcon />}
            title='NocoBase foundation'
          />
          <div className='mt-5 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600'>
            <BlocksIcon />
            Freedom above. Confidence below.
          </div>
        </div>
      </div>
    </aside>
  );
}

interface CapabilityProps {
  readonly description: string;
  readonly icon: ReactNode;
  readonly title: string;
}

function Capability({
  description,
  icon,
  title,
}: CapabilityProps): ReactElement {
  return (
    <div className='flex items-center gap-3'>
      <div className='grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-100'>
        {icon}
      </div>
      <div>
        <div className='font-semibold'>{title}</div>
        <div className='text-sm text-neutral-500'>{description}</div>
      </div>
    </div>
  );
}

function SparklesIcon(): ReactElement {
  return (
    <svg
      aria-hidden='true'
      className='size-4'
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.8'
      viewBox='0 0 24 24'
    >
      <path d='m12 3-1.1 3.4a5 5 0 0 1-3.2 3.2L4 11l3.7 1.3a5 5 0 0 1 3.2 3.2L12 19l1.1-3.5a5 5 0 0 1 3.2-3.2L20 11l-3.7-1.4a5 5 0 0 1-3.2-3.2L12 3Z' />
      <path d='m19 3-.4 1.2a2 2 0 0 1-1.2 1.2L16 6l1.4.5a2 2 0 0 1 1.2 1.2L19 9l.4-1.3a2 2 0 0 1 1.2-1.2L22 6l-1.4-.6a2 2 0 0 1-1.2-1.2L19 3Z' />
    </svg>
  );
}

function ShieldIcon(): ReactElement {
  return (
    <svg
      aria-hidden='true'
      className='size-4'
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='1.8'
      viewBox='0 0 24 24'
    >
      <path d='M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6l-7-3Z' />
      <path d='m9 12 2 2 4-4' />
    </svg>
  );
}

function BlocksIcon(): ReactElement {
  return (
    <svg
      aria-hidden='true'
      className='size-3.5'
      fill='none'
      stroke='currentColor'
      strokeLinejoin='round'
      strokeWidth='1.8'
      viewBox='0 0 24 24'
    >
      <path d='m8 3 5 3-5 3-5-3 5-3Zm8 6 5 3-5 3-5-3 5-3ZM8 15l5 3-5 3-5-3 5-3Z' />
    </svg>
  );
}
