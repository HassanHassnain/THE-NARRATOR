import OpenAI from 'openai';
import { localBaseURL } from '../config.js';
import type { ChatClient } from './interfaces.js';
export function createLocalClient(): ChatClient {
  // Every caller passes its own deadline (beat budget, screen timeout); a 10 s SDK cap cut the twist screen short while Ollama was busy narrating.
  const sdk = new OpenAI({ baseURL: localBaseURL(), apiKey: process.env.OPENAI_API_KEY ?? 'ollama', maxRetries: 0, timeout: 30000 });
  return { async complete(request, signal) {
    const result = await sdk.chat.completions.create(request, { signal });
    const text = result.choices[0]?.message.content;
    if (!text) throw new Error('Local model returned no text');
    return text;
  } };
}
