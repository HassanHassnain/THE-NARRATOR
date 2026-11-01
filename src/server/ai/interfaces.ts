import type { Genre, Narration } from '../../shared/protocol.js';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
export interface Timed<T> { value: T; latencyMs: number }
export interface ChatClient { complete(request: ChatCompletionCreateParamsNonStreaming, signal: AbortSignal): Promise<string> }
export interface Eyes { caption(frame: Buffer, signal: AbortSignal): Promise<Timed<string>> }
export interface WriteRequest { system: string; user: string; model: string; examples?: { scene: string; line: string }[]; twistId?: string; twistText?: string; allowCast?: boolean; recentLines?: string[]; recap?: boolean; chatStyle?: boolean; maxWords?: number }
export interface Writer { write(request: WriteRequest, signal: AbortSignal): Promise<Timed<Narration>>; summarize?(facts: string, model: string, signal: AbortSignal): Promise<Timed<string>> }
export interface Speech { bytes: Buffer; durationSeconds: number; engine: 'kokoro' | 'say' | 'fake' }
export interface TTS { speak(line: string, genre: Genre, signal: AbortSignal, budgetMs?: number): Promise<Timed<Speech>> }
export async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const started = performance.now();
  return { value: await fn(), latencyMs: Math.round(performance.now() - started) };
}
