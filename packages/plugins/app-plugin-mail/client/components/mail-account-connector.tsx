import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { MailProviderView } from '../mail-client.js';
import { Button } from './ui/button.js';
import { NativeSelect } from './ui/native-select.js';

export interface MailAccountConnectorLabels {
  readonly accountType: string;
  readonly chooseAccountType: string;
  readonly connect: string;
  readonly connecting: string;
  readonly connectedAccounts: (count: number) => string;
  readonly capability: (capability: string) => string;
}

export interface MailAccountConnectorProps {
  readonly providers: readonly MailProviderView[];
  readonly connectedAccountCount: (provider: MailProviderView) => number;
  readonly connectingProviderName?: string;
  readonly labels: MailAccountConnectorLabels;
  readonly onConnect: (provider: MailProviderView) => void;
}

export function MailAccountConnector({
  providers,
  connectedAccountCount,
  connectingProviderName,
  labels,
  onConnect,
}: MailAccountConnectorProps): ReactElement {
  const [selectedKey, setSelectedKey] = useState('');
  const selectedProvider = useMemo(
    () => providers.find((provider) => providerKey(provider) === selectedKey),
    [providers, selectedKey],
  );
  const connecting =
    selectedProvider !== undefined &&
    selectedProvider.name === connectingProviderName;
  const capabilities = selectedProvider
    ? Object.entries(selectedProvider.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
    : [];

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
        <label className='space-y-1.5 text-sm font-medium'>
          <span>{labels.accountType}</span>
          <NativeSelect
            onChange={(event) => setSelectedKey(event.target.value)}
            value={selectedKey}
          >
            <option value=''>{labels.chooseAccountType}</option>
            {providers.map((provider) => (
              <option key={providerKey(provider)} value={providerKey(provider)}>
                {provider.label}
                {provider.name === provider.type ? '' : ` · ${provider.name}`}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          disabled={!selectedProvider || connecting}
          onClick={() => {
            if (selectedProvider) onConnect(selectedProvider);
          }}
        >
          <Link2 aria-hidden='true' className='size-4' />
          {connecting ? labels.connecting : labels.connect}
        </Button>
      </div>

      {selectedProvider ? (
        <div className='rounded-lg border bg-muted/20 p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <p className='font-medium'>{selectedProvider.label}</p>
              <p className='text-xs text-muted-foreground'>
                {labels.connectedAccounts(
                  connectedAccountCount(selectedProvider),
                )}
              </p>
            </div>
            <div className='flex flex-wrap justify-end gap-1.5'>
              {capabilities.map((capability) => (
                <span
                  className='rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground'
                  key={capability}
                >
                  {labels.capability(capability)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function providerKey(provider: MailProviderView): string {
  return `${provider.type}:${provider.name}`;
}
