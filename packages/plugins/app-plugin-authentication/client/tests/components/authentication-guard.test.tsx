import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticationProvider,
  GuestAuthentication,
  RequiredAuthentication,
} from '../../auth-provider.js';

const useService = vi.hoisted(() => vi.fn());
vi.mock('@nocobase/app-client', () => ({ useService }));

describe('AuthenticationGuard', () => {
  it.each([
    { session: null, from: '/private', expected: 'Login' },
    {
      session: { user: { id: 'user' }, session: { id: 'session' } },
      from: '/login',
      expected: 'Home',
    },
  ])(
    'redirects from $from according to the session',
    async ({ session, from, expected }) => {
      useService.mockReturnValue({
        getSession: vi.fn().mockResolvedValue({ data: session }),
      });
      render(
        <MemoryRouter initialEntries={[from]}>
          <AuthenticationProvider>
            <Routes>
              <Route
                path='/private'
                element={
                  <RequiredAuthentication>Private</RequiredAuthentication>
                }
              />
              <Route
                path='/login'
                element={<GuestAuthentication>Login</GuestAuthentication>}
              />
              <Route path='/' element={<div>Home</div>} />
            </Routes>
          </AuthenticationProvider>
        </MemoryRouter>,
      );
      expect(await screen.findByText(expected)).toBeInTheDocument();
    },
  );
});
