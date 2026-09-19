import { Refine } from '@refinedev/core';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { Button } from '../../client/components/ui/button';
import { Input } from '../../client/components/ui/input';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '../../client/components/ui/popover';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarMenu,
  SidebarTrigger,
} from '../../client/components/ui/sidebar';
import { AppThemeProvider, ThemeSettings } from '../../client/theme';
import '../../client/styles.css';
import { Folder, File } from 'lucide-react';
import { NavigationTree } from '../../client/layouts/components/navigation-tree';
import type { RouteNavigationItem } from '../../client/routing/route-navigation';

const navigation: RouteNavigationItem[] = Array.from(
  { length: 40 },
  (_, index) => ({
    route: {
      id: String(index),
      name: String(index),
      path: `/fixture/${index}`,
      packageName: 'fixture',
      source: 'application',
      auth: 'optional',
      navigation: {
        title:
          index === 0
            ? '中文长标题：验证侧栏收起后的完整名称提示与浮层内容显示'
            : `Menu ${index + 1}`,
        icon: File,
      },
      componentLoader: async () => ({ default: () => null }),
    },
    children: [],
  }),
);
const group: RouteNavigationItem = {
  route: {
    ...navigation[0]!.route,
    id: 'group',
    name: 'group',
    componentLoader: undefined,
    navigation: { title: '多级导航分组与长列表', icon: Folder },
  },
  children: [
    {
      route: {
        ...navigation[1]!.route,
        id: 'nested',
        name: 'nested',
        componentLoader: undefined,
        navigation: { title: '嵌套分组', icon: Folder },
      },
      children: navigation.slice(0, 2),
    },
    ...navigation,
  ],
};

// A server-free browser fixture using the real shell, primitives and theme provider.
// Run Vite and open /main/tests/fixtures/theme-tokens.html.
export default function Fixture() {
  return (
    <MemoryRouter>
      <AppThemeProvider>
        <Refine options={{ disableTelemetry: true }}>
          <SidebarProvider>
            <Sidebar collapsible='icon' aria-label='Fixture sidebar'>
              <Input aria-label='Sidebar content' />
              <SidebarContent
                role='navigation'
                aria-label='Fixture navigation'
                className='p-2 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto'
              >
                <SidebarMenu>
                  {[group, ...navigation].map((item) => (
                    <NavigationTree
                      key={item.route.id}
                      item={item}
                      selectedKey={undefined}
                      onNavigate={() => {}}
                    />
                  ))}
                </SidebarMenu>
              </SidebarContent>
            </Sidebar>
            <main className='min-w-0 flex-1 space-y-6 p-6'>
              <div className='flex flex-wrap gap-2'>
                <ThemeSettings />
                <SidebarTrigger />
              </div>
              <h1 className='text-3xl'>Theme tokens · 主题样式</h1>
              <p data-testid='body'>Body text · 中文内容与 English text</p>
              <p className='font-serif'>Serif text</p>
              <code>const theme = 'compact';</code>
              <div className='flex flex-wrap gap-2'>
                <Button>Default action</Button>
                <Button size='sm'>Small action</Button>
                <Button size='xs'>Extra small</Button>
                <Button variant='destructive'>Delete</Button>
              </div>
              <Input
                aria-label='Example input'
                placeholder='输入内容 / Enter text'
              />
              <Popover>
                <PopoverTrigger render={<Button variant='outline' />}>
                  Open popover
                </PopoverTrigger>
                <PopoverContent>
                  <PopoverTitle>Portal heading</PopoverTitle>
                  <p>Portal body · 浮层内容</p>
                </PopoverContent>
              </Popover>
              <section className='rounded-xl border bg-card p-4 text-card-foreground shadow-md ring-1 ring-ring'>
                <h2 className='text-xl'>Card heading</h2>
                <p className='text-sm'>
                  A long description that wraps without clipping when fonts and
                  spacing change. 长文本应该正常换行，不应被控件裁切。
                </p>
              </section>
              <svg
                aria-label='Chart palette'
                viewBox='0 0 120 30'
                className='h-8'
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={i}
                    x={(i - 1) * 24}
                    width='20'
                    height='30'
                    fill={`var(--chart-${i})`}
                  />
                ))}
              </svg>
              <div className='flex flex-wrap gap-2'>
                <div className='rounded-sm border p-2'>sm</div>
                <div className='rounded-md border p-2'>md</div>
                <div className='rounded-lg border p-2'>lg</div>
                <div className='rounded-xl border p-2'>xl</div>
                <div className='rounded-2xl border p-2'>2xl</div>
                <div className='rounded-3xl border p-2'>3xl</div>
                <div className='rounded-4xl border p-2'>4xl</div>
              </div>
              <div className='flex flex-wrap gap-4'>
                <div className='shadow-2xs p-2'>2xs</div>
                <div className='shadow-xs p-2'>xs</div>
                <div className='shadow-sm p-2'>sm</div>
                <div className='shadow-md p-2'>md</div>
                <div className='shadow-lg p-2'>lg</div>
                <div className='shadow-xl p-2'>xl</div>
                <div className='shadow-2xl p-2'>2xl</div>
              </div>
            </main>
          </SidebarProvider>
        </Refine>
      </AppThemeProvider>
    </MemoryRouter>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => root.unmount());
