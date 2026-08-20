/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from "node:crypto";
import { STATUS_CODES, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

export type AppWebSocketReadyState = 0 | 1 | 2 | 3;

export type AppWebSocketMessageData = string | ArrayBuffer;

export interface AppWebSocketSendOptions {
  compress?: boolean;
}

export interface AppWebSocket {
  readonly url: URL;
  readonly protocol: string | null;
  readonly readyState: AppWebSocketReadyState;
  send(
    data: string | ArrayBuffer | Uint8Array,
    options?: AppWebSocketSendOptions,
  ): void;
  ping(data?: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface AppWebSocketOpenEvent {
  readonly type: "open";
}

export interface AppWebSocketMessageEvent {
  readonly type: "message";
  readonly data: AppWebSocketMessageData;
}

export interface AppWebSocketCloseEvent {
  readonly type: "close";
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

export interface AppWebSocketErrorEvent {
  readonly type: "error";
  readonly error: unknown;
}

export interface AppWebSocketPongEvent {
  readonly type: "pong";
  readonly data: ArrayBuffer;
}

export interface AppWebSocketEvents {
  onOpen?: (
    event: AppWebSocketOpenEvent,
    ws: AppWebSocket,
  ) => void | Promise<void>;
  onMessage?: (
    event: AppWebSocketMessageEvent,
    ws: AppWebSocket,
  ) => void | Promise<void>;
  onClose?: (
    event: AppWebSocketCloseEvent,
    ws: AppWebSocket,
  ) => void | Promise<void>;
  onError?: (
    event: AppWebSocketErrorEvent,
    ws: AppWebSocket,
  ) => void | Promise<void>;
  onPong?: (
    event: AppWebSocketPongEvent,
    ws: AppWebSocket,
  ) => void | Promise<void>;
}

export type AppWebSocketAcceptResult =
  AppWebSocketEvents | Response | null | undefined;

export type AppWebSocketHandler = (
  request: Request,
  env?: unknown,
) => AppWebSocketAcceptResult | Promise<AppWebSocketAcceptResult>;

export interface AcceptWebSocketUpgradeOptions {
  request: Request;
  events: AppWebSocketEvents;
  head?: Buffer;
  signal?: AbortSignal;
}

export interface CreateWebSocketUpgradeRequestOptions {
  signal?: AbortSignal;
}

interface ParsedWebSocketFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  bytesRead: number;
}

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;
const CLOSE_PROTOCOL_ERROR = 1002;
const CLOSE_ABNORMAL = 1006;

const responseHeadersToSkip = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-protocol",
]);

export function isWebSocketUpgrade(req: IncomingMessage): boolean {
  return firstHeaderValue(req.headers.upgrade)?.toLowerCase() === "websocket";
}

export function createWebSocketUpgradeRequest(
  req: IncomingMessage,
  options: CreateWebSocketUpgradeRequestOptions = {},
): Request {
  return new Request(createRequestUrl(req), {
    method: req.method ?? "GET",
    headers: createRequestHeaders(req),
    signal: options.signal,
  });
}

export function rejectWebSocketUpgrade(
  socket: Duplex,
  status: number = 404,
  headers?: Headers,
): void {
  const responseLines = ["Connection: close", "Content-Length: 0"];
  appendResponseHeaders(responseLines, headers);

  try {
    socket.end(
      `HTTP/1.1 ${status.toString()} ${STATUS_CODES[status] ?? ""}\r\n${responseLines.join("\r\n")}\r\n\r\n`,
    );
  } catch (error) {
    socket.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}

export function acceptWebSocketUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  options: AcceptWebSocketUpgradeOptions,
): AppWebSocket | null {
  const key = firstHeaderValue(req.headers["sec-websocket-key"]);
  if (!key) {
    rejectWebSocketUpgrade(socket, 400);
    return null;
  }

  const responseLines = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${createAcceptKey(key)}`,
  ];
  const protocol = selectSubprotocol(req);
  if (protocol) {
    responseLines.push(`Sec-WebSocket-Protocol: ${protocol}`);
  }

  socket.write(`${responseLines.join("\r\n")}\r\n\r\n`);

  const connection = new NodeAppWebSocket(socket, {
    events: options.events,
    protocol,
    request: options.request,
    signal: options.signal,
  });
  connection.start(options.head);
  return connection;
}

function createRequestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
}

function createRequestUrl(req: IncomingMessage): URL {
  const host = firstHeaderValue(req.headers.host) ?? "localhost";
  const protocol = requestProtocol(req);
  return new URL(req.url ?? "/", `${protocol}://${host}`);
}

function requestProtocol(req: IncomingMessage): string {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() || "http";
  }

  const socket = req.socket as typeof req.socket & { encrypted?: boolean };
  return socket.encrypted ? "https" : "http";
}

function appendResponseHeaders(
  responseLines: string[],
  headers?: Headers,
): void {
  if (!headers) {
    return;
  }

  headers.forEach((value, key) => {
    if (!responseHeadersToSkip.has(key.toLowerCase())) {
      responseLines.push(`${key}: ${value}`);
    }
  });
}

function createAcceptKey(key: string): string {
  return createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
}

function selectSubprotocol(req: IncomingMessage): string | null {
  const header = firstHeaderValue(req.headers["sec-websocket-protocol"]);
  return header?.split(",")[0]?.trim() || null;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

class NodeAppWebSocket implements AppWebSocket {
  readonly url: URL;
  readonly protocol: string | null;

  private readonly events: AppWebSocketEvents;
  private readonly socket: Duplex;
  private readonly signal?: AbortSignal;
  private buffered = Buffer.alloc(0);
  private state: AppWebSocketReadyState = 1;
  private closeSent = false;
  private finished = false;

  constructor(
    socket: Duplex,
    options: {
      events: AppWebSocketEvents;
      protocol: string | null;
      request: Request;
      signal?: AbortSignal;
    },
  ) {
    this.socket = socket;
    this.events = options.events;
    this.protocol = options.protocol;
    this.url = new URL(options.request.url);
    this.signal = options.signal;
  }

  get readyState(): AppWebSocketReadyState {
    return this.state;
  }

  start(head?: Buffer): void {
    const closeForAbort = (): void => {
      this.close(CLOSE_GOING_AWAY, "app runtime closed");
    };

    this.signal?.addEventListener("abort", closeForAbort, { once: true });
    this.socket.on("data", this.handleData);
    this.socket.once("close", () => {
      this.signal?.removeEventListener("abort", closeForAbort);
      this.finish(CLOSE_ABNORMAL, "", false);
    });
    this.socket.once("end", () => {
      this.finish(CLOSE_ABNORMAL, "", false);
    });
    this.socket.once("error", (error) => {
      this.emitError(error);
      this.finish(CLOSE_ABNORMAL, "", false);
    });

    this.invoke(this.events.onOpen, { type: "open" }, this);

    if (head && head.length > 0) {
      this.handleData(head);
    }
  }

  send(
    data: string | ArrayBuffer | Uint8Array,
    _options?: AppWebSocketSendOptions,
  ): void {
    if (this.state !== 1) {
      return;
    }

    const isText = typeof data === "string";
    const payload = normalizeOutgoingData(data);
    this.socket.write(encodeWebSocketFrame(isText ? 0x1 : 0x2, payload));
  }

  ping(data: string | ArrayBuffer | Uint8Array = ""): void {
    if (this.state !== 1) {
      return;
    }

    this.socket.write(encodeWebSocketFrame(0x9, normalizeOutgoingData(data)));
  }

  close(code: number = CLOSE_NORMAL, reason: string = ""): void {
    if (this.state >= 2) {
      return;
    }

    this.state = 2;
    this.sendCloseFrame(code, reason);
    this.socket.end();
  }

  private readonly handleData = (chunk: Buffer | string): void => {
    this.buffered = Buffer.concat([
      this.buffered,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
    ]);

    while (this.buffered.length > 0) {
      let frame: ParsedWebSocketFrame | null;
      try {
        frame = parseWebSocketFrame(this.buffered);
      } catch (error) {
        this.emitError(error);
        this.close(
          CLOSE_PROTOCOL_ERROR,
          error instanceof Error ? error.message : "invalid WebSocket frame",
        );
        return;
      }

      if (!frame) {
        return;
      }

      this.buffered = this.buffered.subarray(frame.bytesRead);
      this.handleFrame(frame);
    }
  };

  private handleFrame(frame: ParsedWebSocketFrame): void {
    if (!frame.fin) {
      this.close(CLOSE_PROTOCOL_ERROR, "fragmented frames are not supported");
      return;
    }

    if (frame.opcode === 0x1) {
      this.emitMessage(frame.payload.toString("utf8"));
      return;
    }

    if (frame.opcode === 0x2) {
      this.emitMessage(bufferToArrayBuffer(frame.payload));
      return;
    }

    if (frame.opcode === 0x8) {
      const close = parseClosePayload(frame.payload);
      if (!this.closeSent) {
        this.sendCloseFrame(close.code, close.reason);
      }
      this.socket.end();
      this.finish(close.code, close.reason, true);
      return;
    }

    if (frame.opcode === 0x9) {
      this.socket.write(encodeWebSocketFrame(0xa, frame.payload));
      return;
    }

    if (frame.opcode === 0xa) {
      this.invoke(
        this.events.onPong,
        { type: "pong", data: bufferToArrayBuffer(frame.payload) },
        this,
      );
      return;
    }

    this.close(CLOSE_PROTOCOL_ERROR, "unsupported frame opcode");
  }

  private emitMessage(data: AppWebSocketMessageData): void {
    this.invoke(this.events.onMessage, { type: "message", data }, this);
  }

  private emitError(error: unknown): void {
    this.invoke(this.events.onError, { type: "error", error }, this);
  }

  private finish(code: number, reason: string, wasClean: boolean): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.state = 3;
    this.socket.off("data", this.handleData);
    this.invoke(
      this.events.onClose,
      { type: "close", code, reason, wasClean },
      this,
    );
  }

  private sendCloseFrame(code: number, reason: string): void {
    if (this.closeSent) {
      return;
    }

    this.closeSent = true;
    this.socket.write(
      encodeWebSocketFrame(0x8, createClosePayload(code, reason)),
    );
  }

  private invoke<
    TEvent extends
      | AppWebSocketOpenEvent
      | AppWebSocketMessageEvent
      | AppWebSocketCloseEvent
      | AppWebSocketErrorEvent
      | AppWebSocketPongEvent,
  >(
    handler:
      ((event: TEvent, ws: AppWebSocket) => void | Promise<void>) | undefined,
    event: TEvent,
    ws: AppWebSocket,
  ): void {
    if (!handler) {
      return;
    }

    try {
      const handlerPromise = Promise.resolve(handler(event, ws));
      handlerPromise.catch((error: unknown) => this.emitError(error));
    } catch (error) {
      this.emitError(error);
    }
  }
}

function normalizeOutgoingData(
  data: string | ArrayBuffer | Uint8Array,
): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data);
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  return Buffer.from(data);
}

function parseWebSocketFrame(buffer: Buffer): ParsedWebSocketFrame | null {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }

    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WebSocket frame is too large");
    }
    payloadLength = Number(length);
    offset += 8;
  }

  if (!masked) {
    throw new Error("Client WebSocket frames must be masked");
  }

  if (buffer.length < offset + 4 + payloadLength) {
    return null;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] ^= mask[index % 4];
  }

  return {
    fin,
    opcode,
    payload,
    bytesRead: offset + payloadLength,
  };
}

function encodeWebSocketFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function createClosePayload(code: number, reason: string): Buffer {
  const reasonBuffer = Buffer.from(reason).subarray(0, 123);
  const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return payload;
}

function parseClosePayload(payload: Buffer): { code: number; reason: string } {
  if (payload.length < 2) {
    return {
      code: CLOSE_NORMAL,
      reason: "",
    };
  }

  return {
    code: payload.readUInt16BE(0),
    reason: payload.subarray(2).toString("utf8"),
  };
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}
