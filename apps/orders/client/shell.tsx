import { useGetIdentity, useLogout } from '@refinedev/core';
import {
  BarChart3,
  Boxes,
  LogOut,
  PackageSearch,
  Settings2,
  ShoppingCart,
  UsersRound,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

export function OrdersShell(): ReactElement {
  const { data: identity } = useGetIdentity<{
    fullName?: string;
    email?: string;
  }>();
  const { mutate: logout } = useLogout();
  return (
    <div className='business-shell'>
      <aside className='business-sidebar'>
        <div className='business-brand'>
          <span>
            <Boxes />
          </span>
          <div>
            <strong>订单运营中心</strong>
            <small>NocoBase 3 App</small>
          </div>
        </div>
        <nav>
          <NavItem icon={<BarChart3 />} label='订单总览' to='/' />
          <NavItem icon={<ShoppingCart />} label='订单管理' to='/orders' />
          <NavItem icon={<UsersRound />} label='客户档案' to='/customers' />
          <NavItem icon={<PackageSearch />} label='商品档案' to='/products' />
        </nav>
        <div className='business-sidebar-note'>
          <strong>业务与设置已分离</strong>
          <span>通用能力由 App Plugin 统一提供。</span>
        </div>
      </aside>
      <div className='business-main'>
        <header className='business-header'>
          <p>订单履约工作区</p>
          <div>
            <NavLink className='header-action' to='/settings'>
              <Settings2 />
              设置中心
            </NavLink>
            <span className='header-account'>
              {identity?.fullName ?? identity?.email ?? '管理员'}
            </span>
            <button
              aria-label='退出登录'
              className='header-icon'
              onClick={() => logout()}
              type='button'
            >
              <LogOut />
            </button>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
}: {
  icon: ReactNode;
  label: string;
  to: string;
}): ReactElement {
  return (
    <NavLink
      className={({ isActive }) => `business-nav ${isActive ? 'active' : ''}`}
      end={to === '/'}
      to={to}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
