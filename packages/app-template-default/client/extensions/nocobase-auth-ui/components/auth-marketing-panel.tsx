import type { ReactElement } from 'react';

export function AuthMarketingPanel(): ReactElement {
  return (
    <aside
      aria-label='About this application'
      className='relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center'
    >
      <div className='pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
      <div className='relative w-full max-w-xl'>
        <p className='text-xs font-semibold tracking-[0.14em] text-white/55 uppercase'>
          NocoBase Default App
        </p>
        <h2 className='mt-3 max-w-lg text-5xl leading-[1.08] font-semibold tracking-[-0.04em]'>
          Build the application your team actually needs.
        </h2>
        <p className='mt-5 max-w-lg text-base leading-7 text-white/60'>
          Keep authentication reliable while adapting the brand, layout and page
          composition to this application.
        </p>
        <div className='mt-10 max-w-md rounded-xl border border-white/15 bg-white/10 p-5 shadow-2xl shadow-black/20 backdrop-blur'>
          <p className='text-sm font-semibold text-white'>
            Application-owned UI
          </p>
          <p className='mt-2 text-sm leading-6 text-white/65'>
            These pages reuse the authentication plugin&apos;s forms and
            behavior without duplicating its routes or session protocol.
          </p>
        </div>
      </div>
    </aside>
  );
}
