import {
  getNocoBaseAppName,
  resolveNocoBaseServerUrl,
} from "../runtime/config.ts";
import { authSession } from "./auth-session.ts";

export type NocoBaseWebSocketMessage = {
  payload?: Record<string, unknown>;
  type?: string;
  [key: string]: unknown;
};

export type NocoBaseWebSocketOptions = {
  pingInterval?: number;
  reconnectMaxInterval?: number;
  url?: string;
  wsPath?: string;
};

type MessageListener = (message: NocoBaseWebSocketMessage) => void;
type OpenListener = () => void;

type WebSocketRuntime = Window & {
  NOCOBASE_WS_PATH?: string;
  NOCOBASE_WS_URL?: string;
  __nocobase_ws_path__?: string;
  __nocobase_ws_url__?: string;
};

const getRuntimeWindow = () =>
  typeof window === "undefined" ? undefined : (window as WebSocketRuntime);

const getRuntimeWebSocketUrl = () => {
  const runtime = getRuntimeWindow();
  return (
    runtime?.NOCOBASE_WS_URL ??
    runtime?.__nocobase_ws_url__ ??
    import.meta.env?.NOCOBASE_WS_URL
  );
};

const getRuntimeWebSocketPath = () => {
  const runtime = getRuntimeWindow();
  return (
    runtime?.NOCOBASE_WS_PATH ??
    runtime?.__nocobase_ws_path__ ??
    import.meta.env?.NOCOBASE_WS_PATH
  );
};

export function resolveNocoBaseWebSocketUrl(
  options: NocoBaseWebSocketOptions = {}
) {
  if (typeof window === "undefined") return undefined;

  const configuredUrl = options.url ?? getRuntimeWebSocketUrl();
  const wsPath = options.wsPath ?? getRuntimeWebSocketPath() ?? "/ws";
  const value = configuredUrl || resolveNocoBaseServerUrl(wsPath);
  const url = new URL(value, window.location.origin);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";

  const appName = getNocoBaseAppName();
  if (appName !== "main" && !url.searchParams.has("__appName")) {
    url.searchParams.set("__appName", appName);
  }
  return url.toString();
}

export class NocoBaseWebSocketClient {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectCount = 0;
  private manuallyClosed = false;
  private authUnsubscribe?: () => void;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly openListeners = new Set<OpenListener>();

  constructor(private readonly options: NocoBaseWebSocketOptions = {}) {}

  get connected() {
    return this.socket?.readyState === 1;
  }

  getURL() {
    return resolveNocoBaseWebSocketUrl(this.options);
  }

  subscribe(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onOpen(listener: OpenListener) {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  connect() {
    if (typeof WebSocket === "undefined") return;
    if (this.socket?.readyState === 0 || this.socket?.readyState === 1) return;
    const url = this.getURL();
    if (!url) return;

    this.manuallyClosed = false;
    this.clearReconnectTimer();
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectCount = 0;
      this.startPing();
      this.authenticate();
      this.openListeners.forEach((listener) => listener());
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as NocoBaseWebSocketMessage;
        this.messageListeners.forEach((listener) => listener(message));
      } catch (error) {
        console.warn("Unable to parse NocoBase WebSocket message", error);
      }
    };

    socket.onerror = () => {
      // The close event owns reconnection. WebSocket errors do not reliably
      // expose a useful reason in browsers.
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.stopPing();
      if (!this.manuallyClosed) this.scheduleReconnect();
    };

    if (!this.authUnsubscribe) {
      this.authUnsubscribe = authSession.subscribe((field) => {
        if (field === "token" || field === "auth") {
          this.authenticate();
        }
      });
    }
  }

  reconnect() {
    this.manuallyClosed = false;
    this.reconnectCount = 0;
    this.socket?.close();
    this.socket = undefined;
    this.connect();
  }

  close() {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.authUnsubscribe?.();
    this.authUnsubscribe = undefined;
    this.socket?.close();
    this.socket = undefined;
  }

  send(message: string | Record<string, unknown>) {
    if (!this.connected) return false;
    this.socket?.send(
      typeof message === "string" ? message : JSON.stringify(message)
    );
    return true;
  }

  authenticate() {
    return this.send({
      type: "auth:token",
      payload: {
        token: authSession.get("token"),
        authenticator: authSession.get("auth"),
      },
    });
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    const maxInterval = this.options.reconnectMaxInterval ?? 30_000;
    const delay = Math.min(
      maxInterval,
      1_000 * 2 ** Math.min(this.reconnectCount, 5)
    );
    this.reconnectCount += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(
      () => this.send("ping"),
      this.options.pingInterval ?? 300_000
    );
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }
}

export const nocobaseWebSocket = new NocoBaseWebSocketClient();
