import type { ClientMessage, ServerMessage } from '../shared/protocol';
export function connect(role: 'host' | 'overlay', onMessage: (message: ServerMessage) => void, onConnection: (open: boolean) => void) {
  let ws: WebSocket; let closed = false; let backoff = 500;
  const open = () => {
    const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('role', role);
    if (role === 'overlay') url.searchParams.set('key', new URLSearchParams(location.search).get('key') ?? '');
    ws = new WebSocket(url);
    ws.onopen = () => { backoff = 500; onConnection(true); };
    ws.onmessage = event => { try { onMessage(JSON.parse(String(event.data)) as ServerMessage); } catch { /* Ignore malformed messages. */ } };
    ws.onclose = () => { onConnection(false); if (!closed) { setTimeout(open, backoff); backoff = Math.min(backoff * 2, 10000); } };
    ws.onerror = () => ws.close();
  };
  open();
  return { send(message: ClientMessage) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }, close() { closed = true; ws.close(); } };
}
