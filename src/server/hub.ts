import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { ClientMessage, PublicState, ServerMessage } from '../shared/protocol.js';
export class Hub {
  private sockets = new Map<WebSocket, 'host' | 'overlay'>();
  private wss = new WebSocketServer({ noServer: true, maxPayload: 2_000_000 });
  get overlays() { return [...this.sockets.values()].filter(role => role === 'overlay').length; }
  constructor(server: Server, private key: string, private state: () => PublicState, private onMessage: (message: ClientMessage) => void) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') return; // Let Vite handle its own HMR upgrade.
      try { if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) { socket.destroy(); return; } }
      catch { socket.destroy(); return; }
      const role = url.searchParams.get('role') === 'overlay' ? 'overlay' : 'host';
      if (role === 'overlay' && url.searchParams.get('key') !== this.key) { socket.destroy(); return; }
      this.wss.handleUpgrade(request, socket, head, ws => {
        this.sockets.set(ws, role); this.broadcastState();
        ws.on('message', data => {
          if (role !== 'host') return;
          try { this.onMessage(JSON.parse(data.toString()) as ClientMessage); }
          catch { this.send(ws, { type: 'notice', message: 'Ignored an invalid control message.' }); }
        });
        ws.on('error', () => ws.close());
        ws.on('close', () => { this.sockets.delete(ws); this.broadcastState(); });
      });
    });
    this.wss.on('error', () => {});
  }
  private send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) ws.send(JSON.stringify(message));
  }
  broadcast(message: ServerMessage) { for (const ws of this.sockets.keys()) this.send(ws, message); }
  broadcastState() { this.broadcast({ type: 'state', state: this.state() }); }
  notice(message: string) { for (const [ws, role] of this.sockets) if (role === 'host') this.send(ws, { type: 'notice', message }); }
  close() { for (const ws of this.sockets.keys()) ws.terminate(); this.wss.close(); }
}
