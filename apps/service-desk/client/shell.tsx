import { useGetIdentity, useLogout } from '@refinedev/core';
import {
  BarChart3,
  BookOpenCheck,
  Headphones,
  LogOut,
  Settings2,
  TicketCheck,
  UsersRound,
  UserRoundCog,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

export function ServiceDeskShell(): ReactElement {
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
            <Headphones />
          </span>
          <div>
            <strong>客户服务中心</strong>
            <small>NocoBase 3 App</small>
          </div>
        </div>
        <nav>
          <NavItem icon={<BarChart3 />} label='服务总览' to='/' />
          <NavItem icon={<TicketCheck />} label='工单管理' to='/tickets' />
          <NavItem icon={<UsersRound />} label='客户联系人' to='/customers' />
          <NavItem icon={<BookOpenCheck />} label='服务目录' to='/catalog' />
          <NavItem icon={<UserRoundCog />} label='客服团队' to='/team' />
        </nav>
        <div className='business-sidebar-note'>
          <strong>业务与设置已分离</strong>
          <span>认证、数据源、通知和设置中心由 App Plugin 提供。</span>
        </div>
      </aside>
      <div className='business-main'>
        <header className='business-header'>
          <p>客户服务工作区</p>
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
