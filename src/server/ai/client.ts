import OpenAI from 'openai';
import { localBaseURL } from '../config.js';
import type { ChatClient } from './interfaces.js';
export function createLocalClient(): ChatClient {
  const sdk = new OpenAI({ baseURL: localBaseURL(), apiKey: process.env.OPENAI_API_KEY ?? 'ollama', maxRetries: 0, timeout: 10000 });
  return { async complete(request, signal) {
    const result = await sdk.chat.completions.create(request, { signal });
    const text = result.choices[0]?.message.content;
    if (!text) throw new Error('Local model returned no text');
    return text;
  } };
}
