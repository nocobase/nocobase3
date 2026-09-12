/* global confirm, document */

const state = {
  page: 'dashboard',
  connections: [],
  inspectorConnection: 'main',
  inspectorCollection: '',
};

const $ = (selector) => document.querySelector(selector);
const content = $('#page-content');
const dialog = $('#dialog');

const pageMeta = {
  dashboard: ['Managed + external', 'Dashboard'],
  orders: ['Main database · managed', 'Orders'],
  products: ['Main database · managed', 'Products'],
  customers: ['External CRM · external', 'Customers'],
  contacts: ['External CRM · external', 'Contacts'],
  database: ['Schema, Metadata, Resolver', 'Database Inspector'],
};

document.addEventListener('click', (event) => {
  const navigation = event.target.closest('[data-page]');
  if (navigation) navigate(navigation.dataset.page);
  if (event.target.closest('#refresh-button')) refresh();
  if (event.target.closest('#primary-action')) primaryAction();
  const action = event.target.closest('[data-action]');
  if (action) handleAction(action.dataset.action, action.dataset.id);
  if (event.target.closest('[data-close-dialog]')) dialog.close();
});

$('#dialog-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void submitDialog();
});

async function navigate(page) {
  state.page = page;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  const [eyebrow, title] = pageMeta[page];
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').textContent = title;
  $('#primary-action').classList.toggle(
    'hidden',
    !['orders', 'products', 'customers', 'contacts'].includes(page),
  );
  $('#primary-action').textContent =
    page === 'orders'
      ? 'New order'
      : `New ${page === 'customers' ? 'customer' : page.slice(0, -1)}`;
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    if (page === 'dashboard') await renderDashboard();
    if (page === 'orders') await renderOrders();
    if (page === 'products') await renderProducts();
    if (page === 'customers') await renderCustomers();
    if (page === 'contacts') await renderContacts();
    if (page === 'database') await renderDatabase();
  } catch (error) {
    showError(error);
  }
}

async function refresh() {
  await navigate(state.page);
  toast('Data refreshed');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers:
      options.body === undefined
        ? options.headers
        : { 'content-type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      `${payload.error?.code || 'REQUEST_FAILED'}: ${payload.error?.message || response.statusText}`,
    );
  return payload.data;
}

async function renderDashboard() {
  const dashboard = await api('/api/dashboard');
  const statusCards = dashboard.byStatus
    .map(
      (item) =>
        `<span class="badge ${esc(item.status)}">${esc(item.status)} · ${item.count}</span>`,
    )
    .join(' ');
  content.innerHTML = `
    <div class="metric-grid">
      ${metric('CRM customers', dashboard.counts.crmCustomers, 'External CRM · readable and writable records')}
      ${metric('Products', dashboard.counts.products, 'Main database · managed Schema')}
      ${metric('Orders', dashboard.counts.orders, 'Created through a main-db transaction')}
      ${metric('Revenue', money(dashboard.revenue), 'Computed with QueryAdapter aggregate')}
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-header"><h2>Recent orders</h2><button class="button secondary small" data-page="orders">View all</button></div><div class="table-wrap">${ordersTable(dashboard.recentOrders)}</div></section>
      <section class="panel"><div class="panel-header"><h2>How this playground works</h2></div><div class="panel-body"><div class="flow">
        ${flow('01', 'External CRM', 'An external physical Schema is inspected, not managed by Builder.')}
        ${flow('02', 'Application service', 'The order service reads CRM customer data and opens a main-db transaction.')}
        ${flow('03', 'Managed database', 'Migration, Metadata Store, Seed, stock updates and order items commit together.')}
        ${flow('04', 'Runtime Collection', 'SchemaInspector + Metadata are resolved through connection.collections.')}
      </div><div class="inline-actions" style="margin-top:16px">${statusCards}</div></div></section>
    </div>`;
}

async function renderOrders() {
  const orders = await api('/api/orders');
  content.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Orders</h2><small class="muted">Main database · transaction-backed create and stock reservation</small></div><button class="button primary" data-action="new-order">New order</button></div><div class="table-wrap">${ordersTable(orders, true)}</div></section>`;
}

async function renderProducts() {
  const products = await api('/api/products');
  content.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Products</h2><small class="muted">Managed Schema · Migration and Seed</small></div><button class="button primary" data-action="new-product">New product</button></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th></th></tr></thead><tbody>${products.map((product) => `<tr><td><strong>${esc(product.name)}</strong></td><td class="mono">${esc(product.sku)}</td><td class="money">${money(product.price)}</td><td>${product.stock}</td><td class="inline-actions"><button class="button secondary small" data-action="edit-product" data-id="${product.id}">Edit</button><button class="button danger small" data-action="delete-product" data-id="${product.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

async function renderCustomers() {
  const customers = await api('/api/crm/customers');
  content.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>CRM Customers</h2><small class="muted">External CRM · Module Metadata Store · record CRUD remains available</small></div><button class="button primary" data-action="new-customer">New customer</button></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Company</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${customers.map((customer) => `<tr><td><strong>${esc(customer.name)}</strong></td><td>${esc(customer.company)}</td><td>${esc(customer.email)}</td><td><span class="badge ${esc(customer.status)}">${esc(customer.status)}</span></td><td class="inline-actions"><button class="button secondary small" data-action="edit-customer" data-id="${customer.id}">Edit</button><button class="button danger small" data-action="delete-customer" data-id="${customer.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

async function renderContacts() {
  const contacts = await api('/api/crm/contacts');
  content.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>CRM Contacts</h2><small class="muted">External physical table with a foreign-key relation to customers</small></div><button class="button primary" data-action="new-contact">New contact</button></div><div class="table-wrap"><table><thead><tr><th>Contact</th><th>Customer</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>${contacts.map((contact) => `<tr><td><strong>${esc(contact.name)}</strong></td><td>${esc(contact.customerName)}</td><td>${esc(contact.email)}</td><td>${esc(contact.role)}</td><td class="inline-actions"><button class="button secondary small" data-action="edit-contact" data-id="${contact.id}">Edit</button><button class="button danger small" data-action="delete-contact" data-id="${contact.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

async function renderDatabase() {
  state.connections = await api('/api/database/connections');
  const connection =
    state.connections.find((item) => item.name === state.inspectorConnection) ||
    state.connections[0];
  state.inspectorConnection = connection.name;
  if (
    !state.inspectorCollection ||
    !connection.collections.some(
      (item) => item.name === state.inspectorCollection,
    )
  )
    state.inspectorCollection = connection.collections[0]?.name || '';
  const detail = state.inspectorCollection
    ? await api(`/api/database/${connection.name}/${state.inspectorCollection}`)
    : null;
  content.innerHTML = `<div class="inspector-toolbar"><div class="field"><label>Connection</label><select id="inspector-connection">${state.connections.map((item) => `<option value="${item.name}" ${item.name === connection.name ? 'selected' : ''}>${item.name} · ${item.schemaManagement}</option>`).join('')}</select></div><div class="field"><label>Collection</label><select id="inspector-collection">${connection.collections.map((item) => `<option value="${item.name}" ${item.name === state.inspectorCollection ? 'selected' : ''}>${item.name}</option>`).join('')}</select></div><div class="inline-actions"><button class="button secondary" data-action="schema-boundary">Try Schema write</button><button class="button secondary" data-action="metadata-boundary">Try Metadata write</button></div></div>
    <div class="metric-grid" style="grid-template-columns:repeat(3,1fr)">${metric('Management mode', connection.schemaManagement, connection.metadataStore)}${metric('Metadata writable', connection.metadataCapabilities.writable ? 'Yes' : 'No', `${connection.metadataCapabilities.optimisticConcurrency ? 'CAS enabled' : 'Source-controlled'}`)}${metric('Physical database', connection.name, connection.databasePath)}</div>
    ${detail ? `<div class="json-grid" style="margin-top:18px">${jsonPanel('Physical Schema', detail.physicalSchema)}${jsonPanel('Metadata Document', detail.metadata)}${jsonPanel('Resolved Collection', detail.resolution)}</div>` : '<div class="empty">No collection selected.</div>'}`;
  $('#inspector-connection').addEventListener('change', (event) => {
    state.inspectorConnection = event.target.value;
    state.inspectorCollection = '';
    void renderDatabase();
  });
  $('#inspector-collection').addEventListener('change', (event) => {
    state.inspectorCollection = event.target.value;
    void renderDatabase();
  });
}

function ordersTable(orders, actions = false) {
  if (!orders.length)
    return '<div class="empty">No orders yet. Create one to exercise the cross-database service.</div>';
  return `<table><thead><tr><th>Order</th><th>CRM customer</th><th>Status</th><th>Total</th><th>Created</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${orders.map((order) => `<tr><td><strong>${esc(order.orderNo)}</strong></td><td>${esc(order.customerNameSnapshot)}</td><td><span class="badge ${esc(order.status)}">${esc(order.status)}</span></td><td class="money">${money(order.totalAmount)}</td><td class="mono">${esc(String(order.createdAt).replace('T', ' ').slice(0, 16))}</td>${actions ? `<td class="inline-actions"><button class="button secondary small" data-action="pay-order" data-id="${order.id}">Mark paid</button><button class="button danger small" data-action="delete-order" data-id="${order.id}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table>`;
}

async function primaryAction() {
  const map = {
    orders: 'new-order',
    products: 'new-product',
    customers: 'new-customer',
    contacts: 'new-contact',
  };
  await handleAction(map[state.page]);
}

async function handleAction(action, id) {
  try {
    if (action.startsWith('new-')) return openDialog(action.slice(4));
    if (action.startsWith('edit-')) return openDialog(action.slice(5), id);
    if (action === 'pay-order')
      await api(`/api/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'paid' },
      });
    if (
      action === 'delete-order' &&
      confirm('Delete this draft order and restore stock?')
    )
      await api(`/api/orders/${id}`, { method: 'DELETE' });
    if (action === 'delete-product' && confirm('Delete this product?'))
      await api(`/api/products/${id}`, { method: 'DELETE' });
    if (
      action === 'delete-customer' &&
      confirm('Delete this CRM customer and their contacts?')
    )
      await api(`/api/crm/customers/${id}`, { method: 'DELETE' });
    if (action === 'delete-contact' && confirm('Delete this CRM contact?'))
      await api(`/api/crm/contacts/${id}`, { method: 'DELETE' });
    if (action === 'schema-boundary') return boundary('schema-write');
    if (action === 'metadata-boundary') return boundary('metadata-write');
    if (action.startsWith('delete-') || action === 'pay-order') {
      toast('Operation completed');
      await navigate(state.page);
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function boundary(kind) {
  const result = await api(
    `/api/database/${state.inspectorConnection}/boundaries/${kind}`,
    { method: 'POST' },
  );
  toast(
    result.rejected
      ? `${result.code}: operation rejected as expected`
      : 'Operation succeeded',
  );
}

async function openDialog(type, id) {
  let existing;
  if (id) {
    const endpoint =
      type === 'customer'
        ? `/api/crm/customers/${id}`
        : type === 'contact'
          ? `/api/crm/contacts/${id}`
          : `/api/products/${id}`;
    existing = await api(endpoint);
  }
  const fields = await dialogFields(type, existing);
  $('#dialog-eyebrow').textContent = id ? 'Edit record' : 'Create record';
  $('#dialog-title').textContent = `${id ? 'Edit' : 'New'} ${type}`;
  $('#dialog-fields').innerHTML = fields;
  $('#dialog-error').classList.add('hidden');
  dialog.dataset.type = type;
  dialog.dataset.id = id || '';
  dialog.showModal();
}

async function dialogFields(type, existing = {}) {
  const value = (name) => esc(existing[name] ?? '');
  if (type === 'product')
    return (
      field('name', 'Name', value('name')) +
      field('sku', 'SKU', value('sku')) +
      field('price', 'Price', value('price'), 'number', '0.01') +
      field('stock', 'Stock', value('stock'), 'number', '1')
    );
  if (type === 'customer')
    return (
      field('name', 'Name', value('name')) +
      field('email', 'Email', value('email'), 'email') +
      field('company', 'Company', value('company')) +
      field('status', 'Status', value('status') || 'active')
    );
  if (type === 'contact') {
    const customers = await api('/api/crm/customers');
    return (
      `<div class="field full"><label>Customer</label><select name="customerId">${customers.map((customer) => `<option value="${customer.id}" ${String(existing.customerId) === String(customer.id) ? 'selected' : ''}>${esc(customer.name)}</option>`).join('')}</select></div>` +
      field('name', 'Name', value('name')) +
      field('email', 'Email', value('email'), 'email') +
      field('role', 'Role', value('role'))
    );
  }
  if (type === 'order') {
    const [customers, products] = await Promise.all([
      api('/api/crm/customers'),
      api('/api/products'),
    ]);
    return (
      field('orderNo', 'Order number', '') +
      `<div class="field full"><label>CRM customer</label><select name="customerId">${customers
        .filter((customer) => customer.status === 'active')
        .map(
          (customer) =>
            `<option value="${customer.id}">${esc(customer.name)} · ${esc(customer.company)}</option>`,
        )
        .join(
          '',
        )}</select></div><div class="field full"><label>Items</label><div class="item-picker">${products.map((product) => `<label><input type="number" name="product-${product.id}" min="0" max="${product.stock}" value="0" /> ${esc(product.name)} <small>${money(product.price)} · ${product.stock} in stock</small></label>`).join('')}</div></div>`
    );
  }
  return '';
}

async function submitDialog() {
  const type = dialog.dataset.type;
  const id = dialog.dataset.id;
  const data = Object.fromEntries(new FormData($('#dialog-form')).entries());
  try {
    let path;
    let body;
    if (type === 'product') {
      path = `/api/products${id ? `/${id}` : ''}`;
      body = { ...data, price: Number(data.price), stock: Number(data.stock) };
    }
    if (type === 'customer') {
      path = `/api/crm/customers${id ? `/${id}` : ''}`;
      body = data;
    }
    if (type === 'contact') {
      path = `/api/crm/contacts${id ? `/${id}` : ''}`;
      body = { ...data, customerId: Number(data.customerId) };
    }
    if (type === 'order') {
      path = '/api/orders';
      body = {
        orderNo: data.orderNo,
        customerId: Number(data.customerId),
        items: Object.entries(data)
          .filter(
            ([name, quantity]) =>
              name.startsWith('product-') && Number(quantity) > 0,
          )
          .map(([name, quantity]) => ({
            productId: Number(name.slice(8)),
            quantity: Number(quantity),
          })),
      };
    }
    await api(path, { method: id ? 'PATCH' : 'POST', body });
    dialog.close();
    toast(`${type} ${id ? 'updated' : 'created'}`);
    await navigate(state.page);
  } catch (error) {
    $('#dialog-error').textContent = error.message;
    $('#dialog-error').classList.remove('hidden');
  }
}

function field(name, label, value = '', type = 'text', step) {
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${value}" ${step ? `step="${step}"` : ''} required /></div>`;
}
function metric(label, value, hint) {
  return `<div class="metric"><p>${label}</p><strong>${value}</strong><small>${esc(String(hint))}</small></div>`;
}
function flow(number, title, description) {
  return `<div class="flow-step"><span>${number}</span><div><strong>${title}</strong><small>${description}</small></div></div>`;
}
function jsonPanel(title, value) {
  return `<section class="panel json-panel"><h3>${title}</h3><pre>${esc(JSON.stringify(value, null, 2))}</pre></section>`;
}
function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}
function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character],
  );
}
function showError(error) {
  content.innerHTML = `<div class="panel"><div class="empty"><strong>Request failed</strong><br /><span class="mono">${esc(error.message)}</span></div></div>`;
  toast(error.message, true);
}
function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add('hidden'), 3400);
}

void api('/api/health')
  .then((health) => {
    $('#connection-status').textContent =
      `${health.connections.length} connections online`;
    return navigate('dashboard');
  })
  .catch(showError);
