import { randomUUID } from 'node:crypto';
import type { StoryEvent } from '../../shared/protocol.js';
import type { ChatMessage } from './types.js';

/** What a burst of chat means. Only these whitelisted tokens ever reach the narrator, so raw chat text never does. */
export type Mood = 'laughing' | 'hyped' | 'mourning' | 'confused' | 'clipping' | 'coping';
const vocabulary: [RegExp, Mood][] = [
  [/^(?:kekw|lul|lulw|omegalul|icant|xdd|xd|lmao+|lmfao|lol+|kek|pepelaugh|😂|🤣|💀)$/iu, 'laughing'],
  [/^(?:pog|pogu|poggers|pogchamp|letsgo+|w+|ez|clap|peepoclap|catjam|hype|goated|🔥)$/iu, 'hyped'],
  [/^(?:f|l+|sadge|pepehands|biblethump|rip|😭|o7)$/iu, 'mourning'],
  [/^(?:\?+|huh|monkas|wutface|nah|bruh|stare|aware|clueless|😳)$/iu, 'confused'],
  [/^(?:copium|copege|hopium|delusional)$/iu, 'coping'],
];
const phrases: [RegExp, string, Mood][] = [
  [/\bclip (?:it|that)\b/iu, 'clip it', 'clipping'],
  [/\b(?:it'?s|its) so over\b/iu, "it's so over", 'mourning'],
  [/\bwe'?re so back\b/iu, "we're so back", 'hyped'],
  [/\bskill issue\b/iu, 'skill issue', 'laughing'],
  [/\bno way\b/iu, 'no way', 'confused'],
  [/\b(?:he'?s|hes) cooked\b/iu, "he's cooked", 'laughing'],
  [/\bchat is this real\b/iu, 'chat is this real', 'confused'],
  [/\blet'?s go+\b/iu, "let's go", 'hyped'],
];

/** Returns the reaction a single chat message expresses, or undefined for ordinary chat. */
export function reactionOf(text: string): { token: string; mood: Mood } | undefined {
  const trimmed = text.trim(); if (!trimmed || trimmed.startsWith('!') || trimmed.length > 200) return;
  for (const [pattern, label, mood] of phrases) if (pattern.test(trimmed)) return { token: label, mood };
  const words = trimmed.split(/\s+/u);
  // Mostly-reaction messages only ("KEKW KEKW", "L", "??"); a long sentence with one "lol" is conversation.
  const hits = words.map(w => ({ w, mood: vocabulary.find(([p]) => p.test(w.replace(/[.!,]+$/u, '')))?.[1] })).filter(h => h.mood);
  if (!hits.length || hits.length / words.length < 0.5) return;
  const first = hits[0]!;
  return { token: /^\?+$/u.test(first.w) ? '?' : first.w.replace(/[.!,]+$/u, '').slice(0, 40), mood: first.mood! };
}

/**
 * Turns bursts of chat reactions (emote spam, meme phrases) into a story event.
 * Tuned for small chats: 3 reaction messages from 2+ chatters, or `soloMessages` from anyone, within the window.
 */
export class ChatPulse {
  private window: { at: number; author: string; token: string; mood: Mood }[] = [];
  private lastFired = -Infinity;
  constructor(private fire: (event: StoryEvent) => void, private windowMs = 10000, private cooldownMs = 25000, private soloMessages = 5) {}
  reset() { this.window = []; this.lastFired = -Infinity; }
  add(message: Pick<ChatMessage, 'authorId' | 'text'>, now = Date.now()) {
    const reaction = reactionOf(message.text); if (!reaction) return;
    this.window = this.window.filter(r => now - r.at <= this.windowMs);
    this.window.push({ at: now, author: message.authorId, ...reaction });
    this.window = this.window.slice(-100);
    if (now - this.lastFired < this.cooldownMs) return;
    const chatters = new Set(this.window.map(r => r.author)).size;
    if (!((this.window.length >= 3 && chatters >= 2) || this.window.length >= this.soloMessages)) return;
    const tokens = new Map<string, number>(); const moods = new Map<Mood, number>();
    for (const r of this.window) { tokens.set(r.token, (tokens.get(r.token) ?? 0) + 1); moods.set(r.mood, (moods.get(r.mood) ?? 0) + 1); }
    const mood = [...moods].sort((a, b) => b[1] - a[1])[0]![0];
    const top = [...tokens].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => n > 1 ? `${t} ×${n}` : t).join(', ');
    this.lastFired = now; this.window = [];
    this.fire({ id: randomUUID(), kind: 'hype', author: '', detail: `${top} (chat is ${mood}, ${chatters} chatter${chatters > 1 ? 's' : ''})` });
  }
}
