import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router';
import { RouteDialog } from '../../client/components/route-dialog';
import { RouteDrawer } from '../../client/components/route-drawer';
import { useRouteOverlay } from '../../client/components/use-route-overlay';
import { Button } from '../../client/components/ui/button';
import { Input } from '../../client/components/ui/input';
import { AppThemeProvider, useTheme } from '../../client/theme';
import '../../client/styles.css';

function Actions() {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button disabled={isClosing} onClick={() => void close()}>
      Close layer
    </Button>
  );
}
function Layer({
  drawer = false,
  child = false,
}: {
  drawer?: boolean;
  child?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const Overlay = drawer ? RouteDrawer : RouteDialog;
  return (
    <Overlay
      title={`${child ? 'Child' : 'Parent'} ${drawer ? 'drawer' : 'dialog'}`}
      description='Long content remains scrollable while the header and footer stay visible.'
      footer={<Actions />}
    >
      <div className='space-y-4'>
        <Input
          aria-label='Draft'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {!child && (
          <Button render={<Link to='child' />} nativeButton={false}>
            Open child
          </Button>
        )}
        {Array.from({ length: 24 }, (_, index) => (
          <p key={index}>
            Paragraph {index + 1}: Draft content stays here when opening and
            closing another layer. 中文内容与 English text.
          </p>
        ))}
        {/* This layer owns its child route, so it places the outlet itself. */}
        {!child && <Outlet />}
      </div>
    </Overlay>
  );
}
function Home() {
  const { setTheme } = useTheme();
  const location = useLocation();
  return (
    <main className='space-y-4 p-6'>
      <h1 className='text-3xl'>Route overlay verification</h1>
      <output>
        {location.pathname}
        {location.search}
      </output>
      <div className='flex flex-wrap gap-3'>
        <Button
          render={<Link to='dialog?filter=recent' />}
          nativeButton={false}
        >
          Open dialog
        </Button>
        <Button
          render={<Link to='drawer?filter=recent' />}
          nativeButton={false}
        >
          Open drawer
        </Button>
        <Button onClick={() => setTheme('dark')}>Dark theme</Button>
        <Button onClick={() => setTheme('light')}>Light theme</Button>
      </div>
      <Outlet />
    </main>
  );
}
// Server-free QA fixture. Open /main/tests/fixtures/route-overlays.html in Vite.
// Add ?entry=/dialog/child to check a directly loaded nested route.
export default function Fixture() {
  const entry = new URLSearchParams(window.location.search).get('entry') ?? '/';
  return (
    <MemoryRouter initialEntries={[entry]}>
      <AppThemeProvider>
        <Routes>
          <Route path='/' element={<Home />}>
            <Route path='dialog' element={<Layer />}>
              <Route path='child' element={<Layer drawer child />} />
            </Route>
            <Route path='drawer' element={<Layer drawer />}>
              <Route path='child' element={<Layer child />} />
            </Route>
          </Route>
        </Routes>
      </AppThemeProvider>
    </MemoryRouter>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => root.unmount());
