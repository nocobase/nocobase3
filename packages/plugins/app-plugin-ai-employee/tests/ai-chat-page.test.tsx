/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const providerState = vi.hoisted(() => ({
  values: [] as boolean[],
  modelSupportsWebSearch: true,
}));

vi.mock('../registry/nocobase-ai/components/index.js', () => ({
  AIChatWindow: () => null,
  ChatSurface: ({ children }: PropsWithChildren) => <>{children}</>,
  ChatSurfaceActions: () => null,
  useAIPageElementPicker: () => ({
    registeredCount: 0,
    startPicking: vi.fn(),
  }),
}));

vi.mock('../registry/nocobase-ai/providers/index.js', () => ({
  AIChatProvider: ({
    children,
    webSearch,
  }: PropsWithChildren<{ webSearch?: boolean }>) => {
    providerState.values.push(webSearch ?? false);
    return <>{children}</>;
  },
  useAIChatBase: () => ({
    id: 'chat-test',
    addWorkContext: vi.fn(),
    currentModel: {
      supportWebSearch: providerState.modelSupportsWebSearch,
    },
    focusComposer: vi.fn(),
  }),
}));

vi.mock('../registry/nocobase-ai/locales/use-ai-translate.js', () => ({
  useAITranslate: () => (key: string, fallback: string) => fallback || key,
}));

vi.mock('../client/dev/demo/configuration-gate.js', () => ({
  AIConfigurationGate: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock('../client/dev/demo/container-showcase.js', () => ({
  ContainerShowcase: ({
    windowProps,
  }: {
    windowProps: {
      composerActions?: Array<{
        key: string;
        label: string;
        active?: boolean;
        disabled?: boolean;
        onClick?: () => void;
      }>;
    };
  }) => {
    const action = windowProps.composerActions?.find(
      (candidate) => candidate.key === 'web-search',
    );
    return (
      <button
        type='button'
        aria-pressed={action?.active}
        disabled={action?.disabled}
        onClick={action?.onClick}
      >
        {action?.label}
      </button>
    );
  },
}));

vi.mock('../client/dev/demo/interaction-showcase.js', () => ({
  InteractionShowcase: () => null,
}));

vi.mock('../client/dev/demo/prompt-generator.js', () => ({
  PromptGenerator: () => null,
}));

vi.mock('../registry/nocobase-ai/shared/ui/badge.js', () => ({
  Badge: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));

vi.mock('../registry/nocobase-ai/shared/ui/card.js', () => ({
  Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('../registry/nocobase-ai/shared/ui/table.js', () => {
  const TablePart = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Table: TablePart,
    TableBody: TablePart,
    TableCell: TablePart,
    TableHead: TablePart,
    TableHeader: TablePart,
    TableRow: TablePart,
  };
});

import { AIChatPage } from '../client/dev/demo/index.js';

describe('AIChatPage', () => {
  it('passes the web search action state to AIChatProvider', () => {
    providerState.values.length = 0;
    providerState.modelSupportsWebSearch = true;
    render(<AIChatPage />);

    const webSearchAction = screen.getByRole('button', {
      name: 'Web search',
    });
    expect(webSearchAction).toHaveAttribute('aria-pressed', 'false');
    expect(providerState.values.at(-1)).toBe(false);

    fireEvent.click(webSearchAction);

    expect(webSearchAction).toHaveAttribute('aria-pressed', 'true');
    expect(providerState.values.at(-1)).toBe(true);
  });

  it('disables web search for an unsupported model', () => {
    providerState.values.length = 0;
    providerState.modelSupportsWebSearch = false;
    render(<AIChatPage />);

    const webSearchAction = screen.getByRole('button', {
      name: 'Current model does not support web search',
    });
    expect(webSearchAction).toBeDisabled();
    expect(providerState.values.at(-1)).toBe(false);
  });
});
