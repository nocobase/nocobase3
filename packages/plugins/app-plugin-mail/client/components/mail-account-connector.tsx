import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { MailProviderView } from '../mail-client.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { NativeSelect } from './ui/native-select.js';

export interface MailAccountConnectorLabels {
  readonly accountType: string;
  readonly chooseAccountType: string;
  readonly connect: string;
  readonly connecting: string;
  readonly connectedAccounts: (count: number) => string;
  readonly capability: (capability: string) => string;
  readonly emailAddress?: string;
  readonly username?: string;
  readonly password?: string;
  readonly displayName?: string;
}

export interface MailAccountCredentials {
  readonly address: string;
  readonly username: string;
  readonly password: string;
  readonly displayName?: string;
}

export interface MailAccountConnectorProps {
  readonly providers: readonly MailProviderView[];
  readonly connectedAccountCount: (provider: MailProviderView) => number;
  readonly connectingProviderName?: string;
  readonly labels: MailAccountConnectorLabels;
  readonly onConnect: (provider: MailProviderView) => void;
  readonly onConnectCredentials?: (
    provider: MailProviderView,
    credentials: MailAccountCredentials,
  ) => void;
}

export function MailAccountConnector({
  providers,
  connectedAccountCount,
  connectingProviderName,
  labels,
  onConnect,
  onConnectCredentials,
}: MailAccountConnectorProps): ReactElement {
  const [selectedKey, setSelectedKey] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
  const usesCredentials = selectedProvider?.connection === 'credentials';
  const credentialsReady =
    address.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0 &&
    onConnectCredentials !== undefined;

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
        <label className='space-y-1.5 text-sm font-medium'>
          <span>{labels.accountType}</span>
          <NativeSelect
            onChange={(event) => {
              setSelectedKey(event.target.value);
              setAddress('');
              setUsername('');
              setPassword('');
              setDisplayName('');
            }}
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
          disabled={
            !selectedProvider ||
            connecting ||
            (usesCredentials && !credentialsReady)
          }
          onClick={() => {
            if (!selectedProvider) return;
            if (usesCredentials) {
              onConnectCredentials?.(selectedProvider, {
                address: address.trim(),
                username: username.trim(),
                password,
                displayName: displayName.trim() || undefined,
              });
            } else {
              onConnect(selectedProvider);
            }
          }}
        >
          <Link2 aria-hidden='true' className='size-4' />
          {connecting ? labels.connecting : labels.connect}
        </Button>
      </div>

      {usesCredentials ? (
        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='space-y-1.5 text-sm font-medium'>
            <span>{labels.emailAddress ?? 'Email address'}</span>
            <Input
              autoComplete='email'
              onChange={(event) => setAddress(event.target.value)}
              value={address}
            />
          </label>
          <label className='space-y-1.5 text-sm font-medium'>
            <span>{labels.username ?? 'Username'}</span>
            <Input
              autoComplete='username'
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </label>
          <label className='space-y-1.5 text-sm font-medium'>
            <span>{labels.password ?? 'Password'}</span>
            <Input
              autoComplete='current-password'
              onChange={(event) => setPassword(event.target.value)}
              type='password'
              value={password}
            />
          </label>
          <label className='space-y-1.5 text-sm font-medium'>
            <span>{labels.displayName ?? 'Display name'}</span>
            <Input
              autoComplete='name'
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </label>
        </div>
      ) : null}

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
