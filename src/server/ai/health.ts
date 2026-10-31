import { eyesModel, localBaseURL, writerModel } from '../config.js';
import type { Health } from '../../shared/protocol.js';
export async function checkHealth(lightMode = false): Promise<Health> {
  const started = performance.now();
  const needed = [...new Set(lightMode ? [eyesModel()] : [writerModel(), eyesModel()])];
  try {
    const response = await fetch(new URL('/api/tags', localBaseURL()), { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json() as { models?: { name: string }[] };
    const installed = data.models?.map(m => m.name) ?? [];
    const missing = needed.filter(m => !installed.includes(m) && !installed.includes(`${m}:latest`));
    return { ollama: true, installed, missing, fixes: missing.map(m => `ollama pull ${m}`), latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { ollama: false, installed: [], missing: needed, fixes: ['Open Ollama or run: ollama serve'], latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : 'Ollama unavailable' };
  }
}
export async function warmModel(model: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(new URL('/api/generate', localBaseURL()), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '10m', options: { num_ctx: 4096 } })
  });
  if (!response.ok) throw new Error(`Could not warm ${model}: ${response.status}`);
  await response.json();
}
export async function releaseModel(model: string): Promise<void> {
  const response = await fetch(new URL('/api/generate', localBaseURL()), {
    method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 })
  });
  if (!response.ok && response.status !== 404) throw new Error(`Could not release ${model}: ${response.status}`);
}
