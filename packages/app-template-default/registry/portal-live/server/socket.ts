import type { PortalLiveSocket } from './connection.js';

export interface PortalLiveRawSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  ping(data?: unknown): void;
  on(event: 'message', listener: (data: unknown, isBinary: boolean) => void): unknown;
  on(event: 'close', listener: (code: number, reason: string) => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  on(event: 'pong', listener: (data: unknown) => void): unknown;
  off(event: 'message', listener: (data: unknown, isBinary: boolean) => void): unknown;
  off(event: 'close', listener: (code: number, reason: string) => void): unknown;
  off(event: 'error', listener: (error: unknown) => void): unknown;
  off(event: 'pong', listener: (data: unknown) => void): unknown;
}

export function adaptPortalLiveSocket(socket: PortalLiveRawSocket): PortalLiveSocket {
  return {
    send(data: string): void {
      socket.send(data);
    },
    close(code = 1000, reason = 'closed'): void {
      socket.close(code, reason);
    },
    onMessage(listener: (data: string) => void): () => void {
      const handleMessage = (data: unknown): void => {
        if (typeof data === 'string') {
          listener(data);
          return;
        }
        if (Buffer.isBuffer(data)) {
          listener(data.toString('utf8'));
          return;
        }
        listener(Buffer.from(data as ArrayBuffer).toString('utf8'));
      };
      socket.on('message', handleMessage);
      return () => socket.off('message', handleMessage);
    },
    onClose(listener: (code: number, reason: string) => void): () => void {
      const handleClose = (code: number, reason: string): void => {
        listener(code, reason);
      };
      socket.on('close', handleClose);
      return () => socket.off('close', handleClose);
    },
    onError(listener: (error: unknown) => void): () => void {
      const handleError = (error: unknown): void => {
        listener(error);
      };
      socket.on('error', handleError);
      return () => socket.off('error', handleError);
    },
    ping(): void {
      socket.ping();
    },
    onPong(listener: () => void): () => void {
      const handlePong = (): void => {
        listener();
      };
      socket.on('pong', handlePong);
      return () => socket.off('pong', handlePong);
    },
  };
}