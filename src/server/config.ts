import { totalmem } from 'node:os';
import { readFileSync } from 'node:fs';
import type { Genre } from '../shared/protocol.js';
interface Preset { persona: string; examples: string[]; exampleScenes?: string[]; voice: string; speed: number; pitch: number; displayStyle: { fontFamily: string; typography: string; color: string; accentColor: string; effect: string } }
interface Config {
  genres: Record<Genre, Preset>;
  cadence: { defaultSeconds: number; minSeconds: number; maxSeconds: number; minimumGapSeconds: number; talkBackBypassesGap: boolean };
  limits: Record<string, number>;
  twistMode: string; blocklist: string[];
}
export const config = JSON.parse(readFileSync('config/narrator.json', 'utf8')) as Config;
export const wordCount = (text: string): number => text.trim() ? text.trim().split(/\s+/u).length : 0;
export function blocked(text: string, list: string[] = config.blocklist): boolean {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '');
  return list.some(word => {
    const escaped = word.normalize('NFKC').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalized);
  });
}
export const writerModel = () => process.env.WRITER_MODEL ?? 'gpt-oss:20b';
export const eyesModel = () => process.env.EYES_MODEL ?? 'gemma3:4b';
export function localBaseURL(): string {
  const url = new URL(process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a local Ollama endpoint: screen narration stays on this machine.');
  return url.href.replace(/\/$/, '');
}

export function resourceVoiceFallback(lightMode: boolean): boolean {
  return process.platform === 'darwin' && !lightMode && totalmem() <= 24 * 1024 ** 3 && writerModel().includes('gpt-oss:20b');
}
