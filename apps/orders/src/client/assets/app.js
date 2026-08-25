const app = document.querySelector('#app');

const copy = {
  status: {
    draft: ['草稿', 'gray'],
    pending: ['待确认', 'blue'],
    processing: ['履约中', 'orange'],
    shipped: ['已发货', 'blue'],
    completed: ['已完成', 'green'],
    cancelled: ['已取消', 'red'],
  },
  payment: {
    unpaid: ['未付款', 'gray'],
    partial: ['部分付款', 'orange'],
    paid: ['已付款', 'green'],
    refunded: ['已退款', 'red'],
  },
  level: {
    standard: ['普通客户', 'gray'],
    key: ['重点客户', 'blue'],
    strategic: ['战略客户', 'green'],
  },
};

const state = {
  page: 'dashboard',
  data: null,
  search: '',
  status: 'all',
  drawer: null,
};

const appBase = `/${location.pathname.split('/').filter(Boolean)[0] || 'orders'}`;

bootstrap();

async function bootstrap() {
  try {
    const response = await api('/api/bootstrap');
    state.data = response.data;
    render();
  } catch (error) {
    app.innerHTML = `
      <div class="empty">
        <h2>订单运营中心暂时无法加载</h2>
        <p>${escapeHtml(error.message)}</p>
        <button class="button primary" data-action="retry">重新加载</button>
      </div>`;
  }
}

function render() {
  const pageContent = {
    dashboard: renderDashboard,
    orders: renderOrders,
    customers: renderCustomers,
    products: renderProducts,
  }[state.page]();

  app.className = '';
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon('cube')}</div>
          <div class="brand-copy">
            <strong>订单运营中心</strong>
          </div>
        </div>
        <nav class="nav">
          ${navButton('dashboard', '▦', '订单总览')}
          ${navButton('orders', '▤', '订单管理')}
          ${navButton('customers', '◎', '客户档案')}
          ${navButton('products', '◇', '商品档案')}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="breadcrumbs"><strong>${pageTitle()}</strong></div>
          <div class="top-actions">
            <button class="icon-button" data-action="refresh" title="刷新">↻</button>
            <div class="avatar">OP</div>
          </div>
        </header>
        <div class="content">${pageContent}</div>
      </main>
    </div>
    ${renderDrawer()}`;
}

function renderDashboard() {
  const { dashboard, orders } = state.data;
  const recent = orders.slice(0, 6);
  const maximum = Math.max(...Object.values(dashboard.statusCounts), 1);
  return `
    ${pageHeader(
      '订单总览',
      '从下单到履约，集中查看订单规模、收入和当前需要处理的事项。',
      '<button class="button primary" data-action="new-order">＋ 新建订单</button>',
    )}
    <section class="metrics">
      ${metric('订单总数', dashboard.orderCount, '全部订单', '#eff6ff')}
      ${metric('待确认', dashboard.pendingCount, '需要业务确认', '#fff7ed')}
      ${metric('履约中', dashboard.inFulfillmentCount, '处理中与已发货', '#f0fdf4')}
      ${metric('有效订单额', money(dashboard.totalRevenue), `已完成 ${money(dashboard.completedRevenue)}`, '#faf5ff')}
    </section>
    <section class="dashboard-grid">
      <div class="panel">
        <div class="panel-header"><h2>最近订单</h2><button class="link-button" data-page="orders">查看全部</button></div>
        ${renderOrderTable(recent, true)}
      </div>
      <div class="panel">
        <div class="panel-header"><h2>订单状态</h2><span class="muted">实时</span></div>
        <div class="panel-body status-stack">
          ${Object.entries(copy.status)
            .map(([status, [label]]) => {
              const count = dashboard.statusCounts[status];
              return `<div class="status-row"><span>${label}</span><div class="progress"><span style="width:${Math.max((count / maximum) * 100, count ? 8 : 0)}%"></span></div><strong>${count}</strong></div>`;
            })
            .join('')}
        </div>
      </div>
    </section>`;
}

function renderOrders() {
  const statuses = [
    ['all', '全部状态'],
    ...Object.entries(copy.status).map(([value, [label]]) => [value, label]),
  ];
  const query = state.search.toLowerCase();
  const orders = state.data.orders.filter((order) => {
    const matchesStatus =
      state.status === 'all' || order.status === state.status;
    const matchesSearch =
      !query ||
      order.orderNo.toLowerCase().includes(query) ||
      order.customerName.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
  return `
    ${pageHeader(
      '订单管理',
      '管理订单明细、付款状态和履约进度，所有修改都会保存到 App 数据目录。',
      '<button class="button primary" data-action="new-order">＋ 新建订单</button>',
    )}
    <div class="toolbar">
      <div class="search"><span>⌕</span><input data-input="search" value="${escapeAttr(state.search)}" placeholder="搜索订单号或客户" /></div>
      <select class="button" data-input="status">${statuses
        .map(
          ([value, label]) =>
            `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label}</option>`,
        )
        .join('')}</select>
    </div>
    <section class="panel">${renderOrderTable(orders)}</section>`;
}

function renderCustomers() {
  return `
    ${pageHeader(
      '客户档案',
      '订单 App 自己维护的客户主数据，可在创建订单时直接选择。',
      '<button class="button primary" data-action="new-customer">＋ 新建客户</button>',
    )}
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>客户名称</th><th>联系人</th><th>电话</th><th>邮箱</th><th>等级</th><th>订单数</th></tr></thead>
        <tbody>${state.data.customers
          .map((customer) => {
            const count = state.data.orders.filter(
              (order) => order.customerId === customer.id,
            ).length;
            return `<tr><td><strong>${escapeHtml(customer.name)}</strong></td><td>${escapeHtml(customer.contactName)}</td><td>${escapeHtml(customer.phone)}</td><td>${escapeHtml(customer.email)}</td><td>${badge(copy.level[customer.level])}</td><td>${count}</td></tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </section>`;
}

function renderProducts() {
  return `
    ${pageHeader(
      '商品档案',
      '维护商品、服务和可售库存，订单金额由服务端根据商品价格自动计算。',
      '<button class="button primary" data-action="new-product">＋ 新建商品</button>',
    )}
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>SKU</th><th>商品名称</th><th>分类</th><th>单价</th><th>库存</th><th>状态</th></tr></thead>
        <tbody>${state.data.products
          .map(
            (product) =>
              `<tr><td class="muted">${escapeHtml(product.sku)}</td><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.category)}</td><td class="amount">${money(product.price)}</td><td>${product.stock}</td><td>${badge(product.status === 'active' ? ['可售', 'green'] : ['停用', 'gray'])}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
    </section>`;
}

function renderOrderTable(orders, compact = false) {
  if (!orders.length) return '<div class="empty">没有符合条件的订单</div>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>订单号</th><th>客户</th><th>金额</th><th>状态</th><th>付款</th>${compact ? '' : '<th>下单时间</th>'}<th></th></tr></thead>
    <tbody>${orders
      .map(
        (order) => `<tr>
        <td><button class="link-button" data-action="view-order" data-id="${order.id}">${escapeHtml(order.orderNo)}</button></td>
        <td>${escapeHtml(order.customerName)}</td>
        <td class="amount">${money(order.totalAmount)}</td>
        <td>${badge(copy.status[order.status])}</td>
        <td>${badge(copy.payment[order.paymentStatus])}</td>
        ${compact ? '' : `<td class="muted">${dateTime(order.placedAt)}</td>`}
        <td><button class="button small" data-action="view-order" data-id="${order.id}">查看</button></td>
      </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

function renderDrawer() {
  if (!state.drawer) return '';
  let body = '';
  let title = '';
  let footer =
    '<button class="button" data-action="close-drawer">关闭</button>';
  if (state.drawer.type === 'order-form') {
    const order = state.drawer.order;
    title = order ? '编辑草稿订单' : '新建订单';
    body = renderOrderForm(order);
    footer += `<button class="button primary" data-action="save-order">${order ? '保存修改' : '创建订单'}</button>`;
  }
  if (state.drawer.type === 'order-detail') {
    title = '订单详情';
    body = renderOrderDetail(state.drawer.order);
  }
  if (state.drawer.type === 'customer-form') {
    title = '新建客户';
    body = renderCustomerForm();
    footer +=
      '<button class="button primary" data-action="save-customer">保存客户</button>';
  }
  if (state.drawer.type === 'product-form') {
    title = '新建商品';
    body = renderProductForm();
    footer +=
      '<button class="button primary" data-action="save-product">保存商品</button>';
  }
  return `<div class="modal-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-header"><h2>${title}</h2><button class="icon-button" data-action="close-drawer">×</button></div>
      <div class="drawer-body">${body}</div>
      <div class="drawer-footer"><span></span><div>${footer}</div></div>
    </aside>`;
}

function renderOrderForm(order) {
  const lines = order?.lines?.length
    ? order.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      }))
    : [{ productId: state.data.products[0]?.id || '', quantity: 1 }];
  return `<form id="order-form" class="form-grid">
    <div class="field full"><label>客户 *</label><select name="customerId" required>${state.data.customers
      .map(
        (customer) =>
          `<option value="${customer.id}" ${order?.customerId === customer.id ? 'selected' : ''}>${escapeHtml(customer.name)}</option>`,
      )
      .join('')}</select></div>
    <div class="field full"><label>订单商品 *</label><div class="line-editor" id="line-editor">${lines.map(renderLineRow).join('')}</div><button type="button" class="button small" data-action="add-line">＋ 添加商品</button></div>
    <div class="field full"><label>订单备注</label><textarea name="notes" placeholder="交付要求、客户说明等">${escapeHtml(order?.notes || '')}</textarea></div>
    ${order ? `<input type="hidden" name="id" value="${order.id}" />` : ''}
  </form>`;
}

function renderLineRow(line) {
  return `<div class="line-row">
    <select name="productId">${state.data.products
      .filter((product) => product.status === 'active')
      .map(
        (product) =>
          `<option value="${product.id}" ${line.productId === product.id ? 'selected' : ''}>${escapeHtml(product.name)} · ${money(product.price)}</option>`,
      )
      .join('')}</select>
    <input name="quantity" type="number" min="1" value="${Number(line.quantity) || 1}" aria-label="数量" />
    <button type="button" class="icon-button" data-action="remove-line" title="删除商品">×</button>
  </div>`;
}

function renderOrderDetail(order) {
  const transitions = {
    draft: [
      ['pending', '提交确认'],
      ['cancelled', '取消订单'],
    ],
    pending: [
      ['processing', '开始履约'],
      ['cancelled', '取消订单'],
    ],
    processing: [
      ['shipped', '确认发货'],
      ['cancelled', '取消订单'],
    ],
    shipped: [['completed', '确认完成']],
    completed: [],
    cancelled: [],
  }[order.status];
  return `
    <div class="detail-list">
      ${detail('订单号', order.orderNo)}${detail('客户', order.customerName)}
      ${detail('订单状态', badge(copy.status[order.status]))}${detail('付款状态', badge(copy.payment[order.paymentStatus]))}
      ${detail('订单金额', `<span class="amount">${money(order.totalAmount)}</span>`)}${detail('下单时间', dateTime(order.placedAt))}
    </div>
    <h3>商品明细</h3>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>商品</th><th>单价</th><th>数量</th><th>小计</th></tr></thead>
      <tbody>${order.lines.map((line) => `<tr><td>${escapeHtml(line.productName)}</td><td>${money(line.unitPrice)}</td><td>${line.quantity}</td><td class="amount">${money(line.subtotal)}</td></tr>`).join('')}</tbody>
    </table></div></div>
    ${order.notes ? `<h3 style="margin-top:24px">备注</h3><p class="muted">${escapeHtml(order.notes)}</p>` : ''}
    <div class="action-row">
      ${order.status === 'draft' ? `<button class="button" data-action="edit-order" data-id="${order.id}">编辑订单</button>` : ''}
      ${transitions.map(([status, label]) => `<button class="button ${status === 'cancelled' ? 'danger' : 'primary'}" data-action="transition-order" data-id="${order.id}" data-status="${status}">${label}</button>`).join('')}
      ${order.status === 'draft' || order.status === 'cancelled' ? `<button class="button danger" data-action="delete-order" data-id="${order.id}">删除订单</button>` : ''}
    </div>`;
}

function renderCustomerForm() {
  return `<form id="customer-form" class="form-grid">
    ${field('客户名称 *', '<input name="name" required placeholder="例如：杭州云岭科技" />', true)}
    ${field('联系人', '<input name="contactName" placeholder="联系人姓名" />')}
    ${field('电话', '<input name="phone" placeholder="联系电话" />')}
    ${field('邮箱', '<input name="email" type="email" placeholder="name@example.com" />')}
    ${field('客户等级', '<select name="level"><option value="standard">普通客户</option><option value="key">重点客户</option><option value="strategic">战略客户</option></select>', true)}
  </form>`;
}

function renderProductForm() {
  return `<form id="product-form" class="form-grid">
    ${field('SKU *', '<input name="sku" required placeholder="NB-SKU-001" />')}
    ${field('商品名称 *', '<input name="name" required placeholder="商品或服务名称" />')}
    ${field('商品分类', '<input name="category" placeholder="软件授权 / 服务" />')}
    ${field('销售单价 *', '<input name="price" required type="number" min="0" step="0.01" />')}
    ${field('可售库存 *', '<input name="stock" required type="number" min="0" step="1" />')}
    ${field('状态', '<select name="status"><option value="active">可售</option><option value="inactive">停用</option></select>')}
  </form>`;
}

function pageHeader(title, description, action) {
  return `<div class="page-header"><div><p class="eyebrow">Operations workspace</p><h1>${title}</h1><p class="page-description">${description}</p></div>${action}</div>`;
}

function pageTitle() {
  return {
    dashboard: '订单总览',
    orders: '订单管理',
    customers: '客户档案',
    products: '商品档案',
  }[state.page];
}

function navButton(page, iconText, label) {
  return `<button class="nav-button ${state.page === page ? 'active' : ''}" data-page="${page}"><span class="nav-icon">${iconText}</span><span class="nav-label">${label}</span></button>`;
}

function metric(label, value, hint, accent) {
  return `<article class="metric-card" style="--accent:${accent}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-hint">${hint}</div></article>`;
}

function field(label, control, full = false) {
  return `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${control}</div>`;
}

function detail(label, value) {
  return `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`;
}

function badge(value) {
  const [label, tone] = value;
  return `<span class="badge ${tone}">${label}</span>`;
}

function icon() {
  return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" stroke="currentColor" stroke-width="1.8"/></svg>';
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-page]');
  if (!target) return;
  if (target.dataset.page) {
    state.page = target.dataset.page;
    state.drawer = null;
    render();
    return;
  }
  const { action, id, status } = target.dataset;
  if (action === 'retry' || action === 'refresh') return refresh();
  if (action === 'close-drawer') {
    state.drawer = null;
    return render();
  }
  if (action === 'new-order') {
    state.drawer = { type: 'order-form', order: null };
    return render();
  }
  if (action === 'new-customer') {
    state.drawer = { type: 'customer-form' };
    return render();
  }
  if (action === 'new-product') {
    state.drawer = { type: 'product-form' };
    return render();
  }
  if (action === 'view-order') return openOrder(id);
  if (action === 'edit-order') {
    const order = state.data.orders.find((item) => item.id === id);
    state.drawer = { type: 'order-form', order };
    return render();
  }
  if (action === 'add-line') {
    document.querySelector('#line-editor').insertAdjacentHTML(
      'beforeend',
      renderLineRow({
        productId: state.data.products[0]?.id || '',
        quantity: 1,
      }),
    );
    return;
  }
  if (action === 'remove-line') {
    const rows = document.querySelectorAll('.line-row');
    if (rows.length > 1) target.closest('.line-row').remove();
    return;
  }
  try {
    if (action === 'save-order') await saveOrder();
    if (action === 'save-customer') await saveCustomer();
    if (action === 'save-product') await saveProduct();
    if (action === 'transition-order') await transitionOrder(id, status);
    if (action === 'delete-order') await deleteOrder(id);
  } catch (error) {
    toast(error.message, true);
  }
});

app.addEventListener('input', (event) => {
  if (event.target.dataset.input === 'search') {
    state.search = event.target.value;
    const focused = event.target.selectionStart;
    render();
    const input = document.querySelector('[data-input="search"]');
    input.focus();
    input.setSelectionRange(focused, focused);
  }
});

app.addEventListener('change', (event) => {
  if (event.target.dataset.input === 'status') {
    state.status = event.target.value;
    render();
  }
});

async function saveOrder() {
  const form = document.querySelector('#order-form');
  const formData = new FormData(form);
  const productIds = formData.getAll('productId');
  const quantities = formData.getAll('quantity');
  const body = {
    customerId: formData.get('customerId'),
    notes: formData.get('notes'),
    lines: productIds.map((productId, index) => ({
      productId,
      quantity: Number(quantities[index]),
    })),
  };
  const id = formData.get('id');
  await api(id ? `/api/orders/${encodeURIComponent(id)}` : '/api/orders', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
  await refresh('订单已保存');
  state.page = 'orders';
}

async function saveCustomer() {
  const form = new FormData(document.querySelector('#customer-form'));
  await api('/api/customers', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(form)),
  });
  await refresh('客户已创建');
}

async function saveProduct() {
  const form = new FormData(document.querySelector('#product-form'));
  await api('/api/products', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(form)),
  });
  await refresh('商品已创建');
}

async function transitionOrder(id, nextStatus) {
  await api(`/api/orders/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status: nextStatus }),
  });
  await refresh('订单状态已更新');
  openOrder(id);
}

async function deleteOrder(id) {
  if (!window.confirm('确定删除这个订单吗？此操作不能撤销。')) return;
  await api(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refresh('订单已删除');
}

function openOrder(id) {
  const order = state.data.orders.find((item) => item.id === id);
  if (!order) return;
  state.drawer = { type: 'order-detail', order };
  render();
}

async function refresh(message) {
  const response = await api('/api/bootstrap');
  state.data = response.data;
  state.drawer = null;
  render();
  if (message) toast(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${appBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

function toast(message, error = false) {
  const existing = document.querySelector('.toast');
  existing?.remove();
  const element = document.createElement('div');
  element.className = `toast ${error ? 'error' : ''}`;
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 2600);
}

function money(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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
  return escapeHtml(value).replaceAll('`', '&#096;');
}
