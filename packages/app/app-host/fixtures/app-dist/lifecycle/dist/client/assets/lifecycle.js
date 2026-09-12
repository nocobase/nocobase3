const stateEl = document.getElementById('state');

async function refresh() {
  const appBasePath = `/${window.location.pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const response = await fetch(`${appBasePath}/api/lifecycle`);
  const data = await response.json();

  stateEl.textContent = JSON.stringify(data, null, 2);
}

refresh().catch((error) => {
  stateEl.textContent = String(error);
});
