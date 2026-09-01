import { useState, type ReactElement } from 'react';

import { Button } from '../components/ui/button.js';

export default function RegistryExamplePage(): ReactElement {
  const [clicks, setClicks] = useState(0);

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>Plugin runtime UI</p>
        <h1 className='text-2xl font-semibold'>UI Registry example</h1>
        <p className='text-sm text-muted-foreground'>
          This fallback page is shipped and upgraded with the plugin. It uses a
          shadcn Button owned by the plugin package.
        </p>
      </header>

      <div className='space-y-4 rounded-xl border p-6'>
        <p className='text-sm'>Button clicks: {clicks}</p>
        <Button onClick={() => setClicks((value) => value + 1)}>
          Try the plugin UI
        </Button>
      </div>
    </section>
  );
}
