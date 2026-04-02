declare module "ws" {
  export interface WebSocket {
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
}
