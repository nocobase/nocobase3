import { Blocks, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

export function AuthMarketingPanel(): ReactElement {
  return (
    <aside
      aria-label='About this application'
      className='relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center'
    >
      <div className='pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
      <div className='relative w-full max-w-xl'>
        <p className='text-xs font-semibold tracking-[0.16em] text-white/55 uppercase'>
          AI-native application platform
        </p>
        <h2 className='mt-4 max-w-xl text-5xl leading-[1.05] font-semibold tracking-[-0.045em]'>
          Let AI build freely.
          <br />
          NocoBase keeps it
          <br />
          reliable.
        </h2>
        <p className='mt-5 max-w-xl text-sm leading-6 text-white/60'>
          Give AI a flexible frontend framework to shape each experience, while
          NocoBase secures the data, permissions, workflows and governance
          underneath.
        </p>
        <div className='mt-8 overflow-hidden rounded-2xl bg-white text-neutral-950 shadow-2xl shadow-black/30'>
          <div className='space-y-5 p-6'>
            <div className='flex gap-4'>
              <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700'>
                <Sparkles aria-hidden='true' className='size-5' />
              </span>
              <div>
                <p className='font-semibold'>AI-native frontend</p>
                <p className='mt-1 text-sm leading-6 text-neutral-500'>
                  Compose interfaces freely on a flexible framework.
                </p>
              </div>
            </div>
            <div className='h-px bg-neutral-200' />
            <div className='flex gap-4'>
              <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700'>
                <ShieldCheck aria-hidden='true' className='size-5' />
              </span>
              <div>
                <p className='font-semibold'>NocoBase foundation</p>
                <p className='mt-1 text-sm leading-6 text-neutral-500'>
                  Reliable data, access control, workflows and governance.
                </p>
              </div>
            </div>
          </div>
          <div className='flex items-center gap-3 bg-neutral-100 px-6 py-4 text-sm font-medium text-neutral-600'>
            <Blocks aria-hidden='true' className='size-4' />
            <span>Freedom above. Confidence below.</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
