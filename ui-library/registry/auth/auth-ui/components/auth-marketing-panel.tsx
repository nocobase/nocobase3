import { Blocks, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

export interface AuthMarketingFeature {
  readonly description: ReactNode;
  readonly id: string;
  readonly icon?: ReactNode;
  readonly title: ReactNode;
}

export interface AuthMarketingPanelProps {
  readonly ariaLabel?: string;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly features?: readonly AuthMarketingFeature[];
  readonly footer?: ReactNode;
  readonly title?: ReactNode;
}

export function AuthMarketingPanel({
  ariaLabel = 'About this application',
  description = 'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
  eyebrow = 'AI-native application platform',
  features = [
    {
      description: 'Compose interfaces freely on a flexible framework.',
      id: 'frontend',
      title: 'AI-native frontend',
    },
    {
      description: 'Reliable data, access control, workflows and governance.',
      id: 'foundation',
      title: 'NocoBase foundation',
    },
  ],
  footer = 'Freedom above. Confidence below.',
  title = (
    <>
      Let AI build freely.
      <br />
      NocoBase keeps it
      <br />
      reliable.
    </>
  ),
}: AuthMarketingPanelProps): ReactElement {
  return (
    <aside
      aria-label={ariaLabel}
      className='relative hidden overflow-hidden bg-neutral-950 p-12 text-white md:grid md:place-items-center'
    >
      <div className='pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
      <div className='relative w-full max-w-xl'>
        <p className='text-xs font-semibold tracking-[0.16em] text-white/55 uppercase'>
          {eyebrow}
        </p>
        <h2 className='mt-4 max-w-xl text-5xl leading-[1.05] font-semibold tracking-[-0.045em]'>
          {title}
        </h2>
        <p className='mt-5 max-w-xl text-sm leading-6 text-white/60'>
          {description}
        </p>
        <div className='mt-8 overflow-hidden rounded-2xl bg-white text-neutral-950 shadow-2xl'>
          <div className='space-y-5 p-6'>
            {features.map((feature, index) => (
              <div className='flex gap-4' key={feature.id}>
                <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700'>
                  {feature.icon ??
                    (index === 0 ? (
                      <Sparkles aria-hidden='true' className='size-5' />
                    ) : (
                      <ShieldCheck aria-hidden='true' className='size-5' />
                    ))}
                </span>
                <div>
                  <p className='font-semibold'>{feature.title}</p>
                  <p className='mt-1 text-sm leading-6 text-neutral-500'>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className='flex items-center gap-3 bg-neutral-100 px-6 py-4 text-sm font-medium text-neutral-600'>
            <Blocks aria-hidden='true' className='size-4' />
            <span>{footer}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
