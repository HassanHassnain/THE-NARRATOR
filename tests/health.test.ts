import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkHealth } from '../src/server/ai/health';
afterEach(() => vi.unstubAllGlobals());
describe('Ollama health with fake HTTP', () => {
  it('reports exact pull commands and lets light mode require only the vision model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ models: [{ name: 'gemma3:4b' }] }))));
    expect((await checkHealth()).fixes).toEqual(['ollama pull gpt-oss:20b']);
    expect((await checkHealth(true)).missing).toEqual([]);
  });
  it('fails gracefully when Ollama is down or returns malformed data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    expect(await checkHealth()).toMatchObject({ ollama: false, fixes: ['Open Ollama or run: ollama serve'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')));
    expect((await checkHealth()).ollama).toBe(false);
  });
});
