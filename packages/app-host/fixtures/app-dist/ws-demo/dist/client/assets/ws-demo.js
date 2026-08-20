document.body.dataset.appMode = "ws-demo fixture";

const assetUrl = new URL(import.meta.url);
const basePath = assetUrl.pathname.replace(/\/assets\/[^/]+$/, "");
const websocketPath = `${basePath}/ws`;
const targetUrl = new URL(websocketPath, location.href);
targetUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
targetUrl.search = "";
targetUrl.hash = "";

const target = targetUrl.toString();
const targetLabel = document.getElementById("websocket-url");
const status = document.getElementById("websocket-status");
const nowTime = document.getElementById("now-time");

if (targetLabel) {
  targetLabel.textContent = target;
}

if (status) {
  status.value = `Target: ${target}`;
}

const socket = new WebSocket(target);

socket.addEventListener("open", () => {
  if (status) {
    status.value = "WebSocket connected";
  }
});

socket.addEventListener("message", (event) => {
  if (nowTime) {
    nowTime.textContent = event.data;
  }
});

socket.addEventListener("close", () => {
  if (status) {
    status.value = "WebSocket closed";
  }
});

socket.addEventListener("error", () => {
  if (status) {
    status.value = "WebSocket error";
  }
});
