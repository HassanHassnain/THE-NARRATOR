import type { Twist } from '../../shared/protocol.js';
export interface ChatMessage { id: string; sourceId: string; authorId: string; author: string; text: string; badges: string[] }
export interface ChatSource { start(channel: string): void; stop(): void }
export type { TwitchPublic } from '../../shared/protocol.js';
export class SeenIds {
  private ids = new Map<string, number>();
  add(id: string, now = Date.now()): boolean {
    if (this.ids.has(id)) return false;
    this.ids.set(id, now);
    for (const [key, at] of this.ids) { if (this.ids.size > 2000 || now - at > 600000) this.ids.delete(key); else break; }
    return true;
  }
}
