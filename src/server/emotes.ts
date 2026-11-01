import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Reaction emotes the narrator and chat use most; resolved to images through 7TV search. */
export const coreEmotes = ['KEKW', 'OMEGALUL', 'ICANT', 'LULW', 'Sadge', 'Copium', 'monkaS', 'Pog', 'PogU', 'POGGERS', 'PepeLaugh', 'HUH', 'Clueless', 'Aware', 'catJAM', 'peepoClap', 'xdd', 'Stare', 'Bedge', 'pepeLaugh'];
const twitchGlobals = ['LUL', 'Kappa', 'PogChamp', 'BibleThump', 'WutFace', 'NotLikeThis', 'Kreygasm', 'SeemsGood', 'ResidentSleeper'];

/** name → image URL. Shared by the overlay (images) and the voice (emote words are not spoken). */
export const emoteMap = new Map<string, string>();
const silent = new Set([...coreEmotes, ...twitchGlobals].map(n => n.toLowerCase()));
// Chat shorthand stays on screen but not in the voice: Kokoro read "L" as "capital L" and "LMAOOO" as "el mal".
const shorthand = /^(?:L+|W+|lmf?ao+|LMF?AO+)$/u;

/** Small models lowercase emote words ("sadge"); restore their real spelling so the overlay can show the image. */
export function fixEmoteCase(line: string) {
  const known = new Map([...coreEmotes, ...twitchGlobals, ...emoteMap.keys()].map(n => [n.toLowerCase(), n] as const));
  return line.split(/(\s+)/u).map(part => {
    const bare = part.replace(/[.,!?…]+$/u, ''); const real = known.get(bare.toLowerCase());
    return real && bare.length > 2 ? real + part.slice(bare.length) : part;
  }).join('').replace(/\b(\S+)(?:\s+\1\b){2,}/gu, '$1 $1');
}
/** Remove emote words before text-to-speech: "it's so over KEKW" is spoken as "it's so over". */
export function stripEmotes(line: string) {
  const spoken = line.split(/\s+/u).filter(word => {
    const bare = word.replace(/[.,!?…]+$/u, '');
    return !(silent.has(bare.toLowerCase()) || emoteMap.has(bare) || shorthand.test(bare));
  }).join(' ').replace(/\s+([.,!?…])/gu, '$1').replace(/[,;:]+$/u, '').trim();
  return spoken;
}

let generation = 0;
export function validEmote(name: unknown, url: unknown): name is string {
  if (typeof name !== 'string' || !/^[\w:()<>]{1,40}$/u.test(name) || typeof url !== 'string') return false;
  try { const u = new URL(url); return u.protocol === 'https:' && ['cdn.7tv.app', 'cdn.betterttv.net', 'static-cdn.jtvnw.net'].includes(u.hostname) && !u.username && !u.password; } catch { return false; }
}
async function json(url: string, init: RequestInit | undefined, http: typeof fetch, signal?: AbortSignal) {
  const response = await http(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(3000), ...(signal ? [signal] : [])]) });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json() as Promise<any>;
}

/**
 * Builds the emote map once and caches it in data/emotes.json (refreshed weekly).
 * Every source is best effort: with no network the overlay just shows emote words as text.
 */
export async function loadEmotes(options: { twitchUserId?: string; helix?: (path: string) => Promise<Response>; http?: typeof fetch; signal?: AbortSignal } = {}, file = 'data/emotes.json') {
  const current = ++generation;
  const request = (url: string, init?: RequestInit) => json(url, init, options.http ?? fetch, options.signal);
  const install = (found: Map<string, string>) => {
    if (current !== generation || options.signal?.aborted) return;
    emoteMap.clear(); for (const [name, url] of found) emoteMap.set(name, url);
  };
  try {
    const cached = JSON.parse(await readFile(file, 'utf8')) as { at: number; emotes: Record<string, string>; user?: string };
    if (Number.isFinite(cached.at) && Date.now() >= cached.at && Date.now() - cached.at < 7 * 86400000 && (cached.user ?? '') === (options.twitchUserId ?? '') && cached.emotes && typeof cached.emotes === 'object') {
      install(new Map(Object.entries(cached.emotes).filter(([k, v]) => validEmote(k, v))));
      return emoteMap.size;
    }
  } catch { /* build fresh */ }
  const found = new Map<string, string>();
  const add = (name: unknown, url: unknown, override = false) => { if (validEmote(name, url) && typeof url === 'string' && (override || !found.has(name))) found.set(name, url); };
  await request('https://7tv.io/v3/emote-sets/global').then(d => d.emotes?.forEach((e: any) => add(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`))).catch(() => undefined);
  await request('https://api.betterttv.net/3/cached/emotes/global').then(d => d.forEach?.((e: any) => add(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`))).catch(() => undefined);
  if (options.twitchUserId) {
    // The channel's own 7TV set wins over search results for the same name.
    await request(`https://7tv.io/v3/users/twitch/${encodeURIComponent(options.twitchUserId)}`).then(d => d.emote_set?.emotes?.forEach((e: any) => add(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`, true))).catch(() => undefined);
  }
  if (options.helix) {
    const emotes = async (path: string) => { const r = await options.helix!(path); return r.ok ? (await r.json() as { data?: any[] }).data ?? [] : []; };
    for (const e of await emotes('chat/emotes/global').catch(() => [])) add(e.name, e.images?.url_2x);
    if (options.twitchUserId) for (const e of await emotes(`chat/emotes?broadcaster_id=${encodeURIComponent(options.twitchUserId)}`).catch(() => [])) add(e.name, e.images?.url_2x);
  }
  const queue = coreEmotes.filter(name => !found.has(name));
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && !options.signal?.aborted) {
    const name = queue.shift()!;
    const query = 'query($q:String!){emotes(query:$q,limit:1,filter:{exact_match:true}){items{id name}}}';
    await request('https://7tv.io/v3/gql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { q: name } }) })
      .then(d => { const e = d.data?.emotes?.items?.[0]; if (e?.name === name) add(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`); }).catch(() => undefined);
    }
  }));
  install(found);
  if (found.size && current === generation && !options.signal?.aborted) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), user: options.twitchUserId ?? '', emotes: Object.fromEntries(found) }));
  }
  return emoteMap.size;
}
