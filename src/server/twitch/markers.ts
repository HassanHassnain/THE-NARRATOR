import type { DeviceAuth } from './deviceAuth.js';
export async function createMarker(auth: DeviceAuth, title: string, notice: (message: string) => void): Promise<void> {
  if (!auth.user || !title.trim()) return;
  try {
    const live = await auth.helix(`streams?user_id=${encodeURIComponent(auth.user.id)}`);
    if (!live.ok) throw new Error(`Live check ${live.status}`);
    const body = await live.json() as { data?: unknown[] };
    if (!body.data?.length) return;
    const marker = await auth.helix('streams/markers', { method: 'POST', body: JSON.stringify({ user_id: auth.user.id, description: title.slice(0,140) }) });
    if (!marker.ok) throw new Error(`Marker ${marker.status}`);
  } catch (error) { notice(`Chapter marker skipped: ${error instanceof Error ? error.message : 'Twitch unavailable'}`); }
}
