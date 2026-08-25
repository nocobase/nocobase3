const app = document.querySelector('#app');
const state = {
  page: 'dashboard',
  data: null,
  search: '',
  status: 'all',
  priority: 'all',
  drawer: null,
  toast: null,
};
const appBase = `/${location.pathname.split('/').filter(Boolean)[0] || 'service-desk'}`;

const copy = {
  status: {
    new: ['新建', 'blue'],
    assigned: ['已分派', 'purple'],
    in_progress: ['处理中', 'orange'],
    waiting: ['待客户', 'gray'],
    resolved: ['已解决', 'green'],
    closed: ['已关闭', 'gray'],
  },
  priority: {
    low: ['低', 'gray'],
    normal: ['普通', 'blue'],
    high: ['高', 'orange'],
    urgent: ['紧急', 'red'],
  },
  level: {
    standard: ['标准客户', 'gray'],
    key: ['重点客户', 'blue'],
    strategic: ['战略客户', 'purple'],
  },
  agentStatus: {
    online: ['在线', 'green'],
    busy: ['忙碌', 'orange'],
    offline: ['离线', 'gray'],
  },
};

bootstrap();

async function bootstrap() {
  try {
    const response = await api('/api/bootstrap');
    state.data = response.data;
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty"><h2>客户服务中心暂时无法加载</h2><p>${escapeHtml(error.message)}</p><button class="button primary" data-action="retry">重新加载</button></div>`;
  }
}

function render() {
  const pageContent = {
    dashboard: renderDashboard,
    tickets: renderTickets,
    customers: renderCustomers,
    catalog: renderCatalog,
    team: renderTeam,
  }[state.page]();

  app.className = '';
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">✦</div><div class="brand-copy"><strong>客户服务中心</strong><span>NocoBase 3 App</span></div></div>
      <nav class="nav">
        ${navButton('dashboard', '▦', '服务总览')}
        ${navButton('tickets', '▤', '工单管理')}
        ${navButton('customers', '◎', '客户联系人')}
        ${navButton('catalog', '◇', '服务目录')}
        ${navButton('team', '◉', '客服团队')}
      </nav>
    </aside>
    <main class="main">
      <header class="topbar"><div class="breadcrumbs">NocoBase 3 / <strong>${pageTitle()}</strong></div><div class="top-actions"><button class="icon-button" data-action="refresh" title="刷新">↻</button><div class="avatar">CS</div></div></header>
      <div class="content">${pageContent}</div>
    </main>
  </div>${renderDrawer()}${renderToast()}`;
}

function renderDashboard() {
  const { dashboard, tickets } = state.data;
  const recent = tickets.slice(0, 6);
  const maximum = Math.max(...Object.values(dashboard.statusCounts), 1);
  const risks = tickets
    .filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
    .sort((a, b) => new Date(a.slaDueAt) - new Date(b.slaDueAt))
    .slice(0, 5);
  return `${pageHeader(
    '服务运营总览',
    '集中查看待处理工单、SLA 风险和团队负载，快速进入今天最需要处理的事项。',
    '<button class="button primary" data-action="new-ticket">＋ 新建工单</button>',
  )}
  <section class="metrics">
    ${metric('工单总数', dashboard.ticketCount, '全部服务请求', '#e7f3ff')}
    ${metric('待处理', dashboard.pendingCount, '需要团队跟进', '#fff2e5')}
    ${metric('已超时', dashboard.overdueCount, '需要立即升级', '#ffecec')}
    ${metric('即将超时', dashboard.atRiskCount, '4 小时内到期', '#fff6df')}
    ${metric('SLA 达标率', `${dashboard.slaComplianceRate}%`, `已解决 ${dashboard.resolvedCount} 单`, '#e8f6f2')}
  </section>
  <section class="dashboard-grid">
    <div class="panel"><div class="panel-header"><h2>最近工单</h2><button class="link-button" data-page="tickets">查看全部</button></div>${renderTicketTable(recent, true)}</div>
    <div class="dashboard-stack">
      <div class="panel"><div class="panel-header"><h2>工单状态</h2><span class="muted">实时</span></div><div class="panel-body status-stack">${Object.entries(
        copy.status,
      )
        .map(([status, [label]]) => {
          const count = dashboard.statusCounts[status];
          return `<div class="status-row"><span>${label}</span><div class="progress"><span style="width:${Math.max((count / maximum) * 100, count ? 8 : 0)}%"></span></div><strong>${count}</strong></div>`;
        })
        .join('')}</div></div>
      <div class="panel"><div class="panel-header"><h2>SLA 风险队列</h2><span class="muted">按到期时间</span></div><div class="panel-body risk-list">${risks
        .map(
          (ticket) =>
            `<div class="risk-item"><button class="link-button" data-action="view-ticket" data-id="${ticket.id}">${escapeHtml(ticket.ticketNo)} · ${escapeHtml(ticket.title)}</button><span>${slaLabel(ticket)}</span></div>`,
        )
        .join('')}</div></div>
    </div>
  </section>`;
}

function renderTickets() {
  const query = state.search.toLowerCase();
  const tickets = state.data.tickets.filter((ticket) => {
    const matchesStatus =
      state.status === 'all' || ticket.status === state.status;
    const matchesPriority =
      state.priority === 'all' || ticket.priority === state.priority;
    const matchesSearch =
      !query ||
      ticket.ticketNo.toLowerCase().includes(query) ||
      ticket.title.toLowerCase().includes(query) ||
      ticket.customerName.toLowerCase().includes(query);
    return matchesStatus && matchesPriority && matchesSearch;
  });
  return `${pageHeader(
    '工单管理',
    '受理、分派并跟踪客户问题。状态、SLA 和每次处理记录都会保存到服务端。',
    '<button class="button primary" data-action="new-ticket">＋ 新建工单</button>',
  )}
  <div class="toolbar">
    <div class="search"><span>⌕</span><input data-input="search" value="${escapeAttr(state.search)}" placeholder="搜索工单号、标题或客户" /></div>
    <div class="toolbar-group">
      <select class="button" data-input="priority"><option value="all">全部优先级</option>${Object.entries(
        copy.priority,
      )
        .map(
          ([value, [label]]) =>
            `<option value="${value}" ${state.priority === value ? 'selected' : ''}>${label}</option>`,
        )
        .join('')}</select>
      <select class="button" data-input="status"><option value="all">全部状态</option>${Object.entries(
        copy.status,
      )
        .map(
          ([value, [label]]) =>
            `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label}</option>`,
        )
        .join('')}</select>
    </div>
  </div>
  <section class="panel">${renderTicketTable(tickets)}</section>`;
}

function renderCustomers() {
  return `${pageHeader(
    '客户联系人',
    '服务台自己维护的客户和联系人，可直接关联到新工单。',
    '<button class="button primary" data-action="new-customer">＋ 新建客户</button>',
  )}
  <section class="panel"><div class="table-wrap"><table><thead><tr><th>客户</th><th>联系人</th><th>电话</th><th>邮箱</th><th>等级</th><th>工单数</th><th>未结工单</th></tr></thead><tbody>${state.data.customers
    .map((customer) => {
      const tickets = state.data.tickets.filter(
        (ticket) => ticket.customerId === customer.id,
      );
      const openCount = tickets.filter(
        (ticket) => !['resolved', 'closed'].includes(ticket.status),
      ).length;
      return `<tr><td><strong>${escapeHtml(customer.company)}</strong></td><td>${escapeHtml(customer.contactName)}</td><td>${escapeHtml(customer.phone)}</td><td>${escapeHtml(customer.email)}</td><td>${badge(copy.level[customer.level])}</td><td>${tickets.length}</td><td>${openCount}</td></tr>`;
    })
    .join('')}</tbody></table></div></section>`;
}

function renderCatalog() {
  return `${pageHeader(
    '服务目录',
    '统一定义服务分类、负责团队和基础 SLA；新建工单会据此计算到期时间。',
    '',
  )}
  <section class="catalog-grid">${state.data.services
    .map(
      (service) =>
        `<article class="catalog-card"><div class="catalog-card-top"><div><h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.category)}</p></div>${badge(service.status === 'active' ? ['已启用', 'green'] : ['已停用', 'gray'])}</div><div class="catalog-meta"><span>${escapeHtml(service.ownerTeam)}</span><strong>基础 SLA ${duration(service.slaMinutes)}</strong></div></article>`,
    )
    .join('')}</section>`;
}

function renderTeam() {
  return `${pageHeader(
    '客服团队',
    '查看客服在线状态和当前未结工单，分派操作会由服务端校验人员状态。',
    '',
  )}
  <section class="team-grid">${state.data.agents
    .map((agent) => {
      const workload = state.data.tickets.filter(
        (ticket) =>
          ticket.assigneeId === agent.id &&
          !['resolved', 'closed'].includes(ticket.status),
      ).length;
      return `<article class="agent-card"><div class="agent-card-top"><div class="agent-identity"><div class="agent-avatar">${escapeHtml(agent.name.slice(-1))}</div><div><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.team)} · ${agent.role === 'lead' ? '组长' : '客服'}</p></div></div>${badge(copy.agentStatus[agent.status])}</div><div class="workload"><strong>${workload}</strong> 个未结工单</div></article>`;
    })
    .join('')}</section>`;
}

function renderTicketTable(tickets, compact = false) {
  if (!tickets.length) return '<div class="empty">没有符合条件的工单</div>';
  return `<div class="table-wrap"><table><thead><tr><th>工单</th><th>客户</th><th>优先级</th><th>状态</th><th>负责人</th><th>SLA</th>${compact ? '' : '<th>更新时间</th>'}<th></th></tr></thead><tbody>${tickets
    .map(
      (ticket) => `<tr>
        <td class="ticket-title"><button class="link-button" data-action="view-ticket" data-id="${ticket.id}"><strong>${escapeHtml(ticket.title)}</strong><span>${escapeHtml(ticket.ticketNo)} · ${escapeHtml(ticket.serviceName)}</span></button></td>
        <td>${escapeHtml(ticket.customerName)}</td><td>${badge(copy.priority[ticket.priority])}</td><td>${badge(copy.status[ticket.status])}</td><td>${escapeHtml(ticket.assigneeName || '待分派')}</td><td class="${slaClass(ticket)}">${slaLabel(ticket)}</td>${compact ? '' : `<td class="muted">${dateTime(ticket.updatedAt)}</td>`}<td><button class="button small" data-action="view-ticket" data-id="${ticket.id}">处理</button></td>
      </tr>`,
    )
    .join('')}</tbody></table></div>`;
}

function renderDrawer() {
  if (!state.drawer) return '';
  let body = '';
  let title = '';
  let footer =
    '<button class="button" data-action="close-drawer">关闭</button>';
  if (state.drawer.type === 'ticket-form') {
    title = state.drawer.ticket ? '编辑工单' : '新建工单';
    body = renderTicketForm(state.drawer.ticket);
    footer += `<button class="button primary" data-action="save-ticket">${state.drawer.ticket ? '保存修改' : '创建工单'}</button>`;
  }
  if (state.drawer.type === 'ticket-detail') {
    title = '工单详情';
    body = renderTicketDetail(state.drawer.ticket);
    if (state.drawer.ticket.status !== 'closed') {
      footer +=
        '<button class="button" data-action="edit-ticket">编辑工单</button>';
    }
  }
  if (state.drawer.type === 'customer-form') {
    title = '新建客户';
    body = renderCustomerForm();
    footer +=
      '<button class="button primary" data-action="save-customer">保存客户</button>';
  }
  return `<div class="modal-backdrop" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-header"><h2>${title}</h2><button class="icon-button" data-action="close-drawer">×</button></div><div class="drawer-body">${body}</div><div class="drawer-footer"><span></span><div>${footer}</div></div></aside>`;
}

function renderTicketForm(ticket) {
  return `<form id="ticket-form" class="form-grid">
    <div class="field full"><label>工单标题</label><input name="title" value="${escapeAttr(ticket?.title || '')}" maxlength="180" required /></div>
    <div class="field"><label>客户</label><select name="customerId" required>${optionList(state.data.customers, ticket?.customerId, 'company')}</select></div>
    <div class="field"><label>服务项目</label><select name="serviceId" required>${optionList(
      state.data.services.filter((item) => item.status === 'active'),
      ticket?.serviceId,
      'name',
    )}</select></div>
    <div class="field"><label>优先级</label><select name="priority">${Object.entries(
      copy.priority,
    )
      .map(
        ([value, [label]]) =>
          `<option value="${value}" ${(ticket?.priority || 'normal') === value ? 'selected' : ''}>${label}</option>`,
      )
      .join('')}</select></div>
    <div class="field full"><label>问题描述</label><textarea name="description" maxlength="3000" placeholder="说明问题现象、影响范围和期望结果">${escapeHtml(ticket?.description || '')}</textarea></div>
  </form>`;
}

function renderCustomerForm() {
  return `<form id="customer-form" class="form-grid">
    <div class="field full"><label>客户名称</label><input name="company" required maxlength="160" /></div>
    <div class="field"><label>联系人</label><input name="contactName" required maxlength="120" /></div>
    <div class="field"><label>客户等级</label><select name="level"><option value="standard">标准客户</option><option value="key">重点客户</option><option value="strategic">战略客户</option></select></div>
    <div class="field"><label>电话</label><input name="phone" maxlength="64" /></div>
    <div class="field"><label>邮箱</label><input name="email" type="email" maxlength="320" /></div>
  </form>`;
}

function renderTicketDetail(ticket) {
  const transitions = availableTransitions(ticket.status);
  return `<div class="detail-hero"><div>${badge(copy.priority[ticket.priority])} ${badge(copy.status[ticket.status])}</div><h3>${escapeHtml(ticket.title)}</h3><p>${escapeHtml(ticket.description || '暂无问题描述')}</p></div>
  <div class="detail-meta">
    <div><span>工单编号</span><strong>${escapeHtml(ticket.ticketNo)}</strong></div><div><span>客户</span><strong>${escapeHtml(ticket.customerName)}</strong></div>
    <div><span>服务项目</span><strong>${escapeHtml(ticket.serviceName)}</strong></div><div><span>负责人</span><strong>${escapeHtml(ticket.assigneeName || '待分派')}</strong></div>
    <div><span>SLA 到期</span><strong class="${slaClass(ticket)}">${dateTime(ticket.slaDueAt)} · ${slaLabel(ticket)}</strong></div><div><span>最近更新</span><strong>${dateTime(ticket.updatedAt)}</strong></div>
  </div>
  ${
    ticket.status !== 'closed'
      ? `<section class="detail-section"><h4>分派与流转</h4><div class="action-row"><select id="assign-agent" class="button"><option value="">选择负责人</option>${state.data.agents
          .filter((agent) => agent.status !== 'offline')
          .map(
            (agent) =>
              `<option value="${agent.id}" ${ticket.assigneeId === agent.id ? 'selected' : ''}>${escapeHtml(agent.name)} · ${escapeHtml(agent.team)}</option>`,
          )
          .join(
            '',
          )}</select><button class="button" data-action="assign-ticket">确认分派</button>${transitions.map(([status, label]) => `<button class="button ${status === 'resolved' ? 'primary' : ''}" data-action="transition-ticket" data-status="${status}">${label}</button>`).join('')}</div></section>`
      : ''
  }
  ${!['resolved', 'closed'].includes(ticket.status) ? `<section class="detail-section"><h4>添加处理记录</h4><div class="reply-box"><textarea id="reply-content" placeholder="记录处理进展或给客户的回复"></textarea><div><button class="button primary" data-action="reply-ticket">添加回复</button></div></div></section>` : ''}
  <section class="detail-section"><h4>处理动态</h4><div class="timeline">${ticket.activities.map((item) => `<div class="timeline-item"><strong>${escapeHtml(item.author)}</strong><p>${escapeHtml(activityText(item.content))}</p><time>${dateTime(item.createdAt)}</time></div>`).join('')}</div></section>
  ${ticket.status === 'new' || ticket.status === 'closed' ? '<section class="detail-section"><button class="button danger" data-action="delete-ticket">删除工单</button></section>' : ''}`;
}

function availableTransitions(status) {
  return {
    new: [
      ['in_progress', '开始处理'],
      ['closed', '直接关闭'],
    ],
    assigned: [
      ['in_progress', '开始处理'],
      ['waiting', '等待客户'],
      ['resolved', '标记解决'],
    ],
    in_progress: [
      ['waiting', '等待客户'],
      ['resolved', '标记解决'],
    ],
    waiting: [
      ['in_progress', '继续处理'],
      ['resolved', '标记解决'],
    ],
    resolved: [
      ['in_progress', '重新打开'],
      ['closed', '关闭工单'],
    ],
    closed: [],
  }[status];
}

function navButton(page, symbol, label) {
  return `<button class="nav-button ${state.page === page ? 'active' : ''}" data-page="${page}"><span class="nav-icon">${symbol}</span><span class="nav-label">${label}</span></button>`;
}

function pageHeader(title, description, actions) {
  return `<header class="page-header"><div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></header>`;
}

function metric(label, value, note, color) {
  return `<article class="metric" style="--metric-color:${color}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function badge(value) {
  const [label, color] = value;
  return `<span class="badge ${color}">${label}</span>`;
}

function optionList(items, selected, labelKey) {
  return `<option value="">请选择</option>${items.map((item) => `<option value="${item.id}" ${selected === item.id ? 'selected' : ''}>${escapeHtml(item[labelKey])}</option>`).join('')}`;
}

function pageTitle() {
  return {
    dashboard: '服务总览',
    tickets: '工单管理',
    customers: '客户联系人',
    catalog: '服务目录',
    team: '客服团队',
  }[state.page];
}

function renderToast() {
  if (!state.toast) return '';
  return `<div class="toast ${state.toast.type === 'error' ? 'error' : ''}">${escapeHtml(state.toast.message)}</div>`;
}

function showToast(message, type = 'success') {
  state.toast = { message, type };
  render();
  window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2400);
}

async function refresh(message) {
  const response = await api('/api/bootstrap');
  state.data = response.data;
  if (state.drawer?.ticket) {
    const ticket = state.data.tickets.find(
      (item) => item.id === state.drawer.ticket.id,
    );
    state.drawer = ticket ? { type: 'ticket-detail', ticket } : null;
  }
  if (message) showToast(message);
  else render();
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-page], [data-action]');
  if (!target) return;
  const page = target.dataset.page;
  if (page) {
    state.page = page;
    state.drawer = null;
    render();
    return;
  }
  const action = target.dataset.action;
  try {
    if (action === 'retry' || action === 'refresh') return void bootstrap();
    if (action === 'close-drawer') {
      if (
        event.target.classList.contains('modal-backdrop') ||
        event.target.closest('.drawer')
      ) {
        state.drawer = null;
        render();
      }
      return;
    }
    if (action === 'new-ticket') {
      state.drawer = { type: 'ticket-form', ticket: null };
      return void render();
    }
    if (action === 'new-customer') {
      state.drawer = { type: 'customer-form' };
      return void render();
    }
    if (action === 'view-ticket') {
      const ticket = state.data.tickets.find(
        (item) => item.id === target.dataset.id,
      );
      state.drawer = { type: 'ticket-detail', ticket };
      return void render();
    }
    if (action === 'edit-ticket') {
      state.drawer = { type: 'ticket-form', ticket: state.drawer.ticket };
      return void render();
    }
    if (action === 'save-ticket') return void saveTicket();
    if (action === 'save-customer') return void saveCustomer();
    if (action === 'assign-ticket') return void assignTicket();
    if (action === 'transition-ticket')
      return void transitionTicket(target.dataset.status);
    if (action === 'reply-ticket') return void replyTicket();
    if (action === 'delete-ticket') return void deleteTicket();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

app.addEventListener('input', (event) => {
  if (event.target.dataset.input === 'search') {
    state.search = event.target.value;
    render();
    const search = app.querySelector('[data-input="search"]');
    search?.focus();
    search?.setSelectionRange(state.search.length, state.search.length);
  }
});

app.addEventListener('change', (event) => {
  if (event.target.dataset.input === 'status') {
    state.status = event.target.value;
    render();
  }
  if (event.target.dataset.input === 'priority') {
    state.priority = event.target.value;
    render();
  }
});

async function saveTicket() {
  const form = document.querySelector('#ticket-form');
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const ticket = state.drawer.ticket;
  await api(ticket ? `/api/tickets/${ticket.id}` : '/api/tickets', {
    method: ticket ? 'PATCH' : 'POST',
    body: JSON.stringify(values),
  });
  state.drawer = null;
  await refresh(ticket ? '工单已更新' : '工单已创建');
}

async function saveCustomer() {
  const form = document.querySelector('#customer-form');
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  await api('/api/customers', { method: 'POST', body: JSON.stringify(values) });
  state.drawer = null;
  await refresh('客户已创建');
}

async function assignTicket() {
  const agentId = document.querySelector('#assign-agent').value;
  if (!agentId) throw new Error('请选择负责人');
  await api(`/api/tickets/${state.drawer.ticket.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
  await refresh('工单已分派');
}

async function transitionTicket(status) {
  await api(`/api/tickets/${state.drawer.ticket.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
  await refresh('工单状态已更新');
}

async function replyTicket() {
  const content = document.querySelector('#reply-content').value.trim();
  if (!content) throw new Error('请输入处理记录');
  await api(`/api/tickets/${state.drawer.ticket.id}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  await refresh('处理记录已添加');
}

async function deleteTicket() {
  if (!window.confirm('确定删除这个工单吗？')) return;
  await api(`/api/tickets/${state.drawer.ticket.id}`, { method: 'DELETE' });
  state.drawer = null;
  await refresh('工单已删除');
}

async function api(pathname, init) {
  const response = await fetch(`${appBase}${pathname}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the HTTP fallback when an upstream response is not JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function slaLabel(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) return '已完成';
  const minutes = Math.round(
    (new Date(ticket.slaDueAt).getTime() - Date.now()) / 60000,
  );
  if (minutes < 0) return `已超时 ${duration(Math.abs(minutes))}`;
  return `剩余 ${duration(minutes)}`;
}

function slaClass(ticket) {
  if (['resolved', 'closed'].includes(ticket.status)) return 'muted';
  const minutes = (new Date(ticket.slaDueAt).getTime() - Date.now()) / 60000;
  if (minutes < 0) return 'sla-overdue';
  if (minutes <= 240) return 'sla-risk';
  return 'muted';
}

function duration(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} 分钟`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天`;
}

function dateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function activityText(content) {
  return content
    .replaceAll('new', '新建')
    .replaceAll('assigned', '已分派')
    .replaceAll('in_progress', '处理中')
    .replaceAll('waiting', '待客户')
    .replaceAll('resolved', '已解决')
    .replaceAll('closed', '已关闭');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
