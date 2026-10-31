import { wordCount } from '../config.js';
import { timed, type ChatClient, type Writer, type WriteRequest } from './interfaces.js';
import type { Narration } from '../../shared/protocol.js';
export const narrationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    line: { type: 'string', maxLength: 150 }, chapterTitle: { type: 'string', maxLength: 60 },
    castUpdates: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, role: { type: 'string' } }, required: ['name', 'role'] } },
    usedTwistId: { type: 'string' }
  }, required: ['line', 'chapterTitle', 'castUpdates', 'usedTwistId']
};
export function parseNarration(text: string): Narration {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected narration object');
  const v = value as Record<string, unknown>;
  if (typeof v.line !== 'string' || !v.line.trim() || wordCount(v.line) > 30 || v.line.length > 500) throw new Error('Narration must contain 1–30 words');
  if (!/[.!?…][\"'”’]?$/.test(v.line.trim())) throw new Error('Finish the sentence; use fewer words so it fits the schema.');
  if (!Array.isArray(v.castUpdates) || v.castUpdates.length > 10 || v.castUpdates.some(c => !c || typeof c.name !== 'string' || typeof c.role !== 'string' || c.name.length > 80 || c.role.length > 120)) throw new Error('Invalid cast updates');
  for (const key of ['chapterTitle', 'usedTwistId']) if (v[key] !== undefined && typeof v[key] !== 'string') throw new Error(`Invalid ${key}`);
  if (typeof v.chapterTitle === 'string' && v.chapterTitle.length > 100) throw new Error('Chapter title too long');
  return {
    line: v.line.trim(), castUpdates: v.castUpdates as Narration['castUpdates'],
    ...(v.chapterTitle ? { chapterTitle: v.chapterTitle as string } : {}),
    ...(v.usedTwistId ? { usedTwistId: v.usedTwistId as string } : {})
  };
}
export class LocalWriter implements Writer {
  constructor(private client: ChatClient) {}
  write(request: WriteRequest, signal: AbortSignal) {
    return timed(async () => {
      let invalid: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const schema = structuredClone(narrationSchema);
        const constrained = schema.properties as Record<string, unknown>;
        constrained.usedTwistId = { type: 'string', enum: [request.twistId ?? ''] };
        if (!request.allowCast) constrained.castUpdates = { type: 'array', maxItems: 0, items: narrationSchema.properties.castUpdates.items };
        const text = await this.client.complete({
          model: request.model, temperature: 0.65, max_tokens: request.model.includes('gpt-oss') ? 700 : 300,
          ...(request.model.includes('gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
          response_format: { type: 'json_schema', json_schema: { name: 'narration', strict: true, schema } },
          messages: [{ role: 'system', content: request.system + (request.model.includes('gpt-oss') ? '\nStyle examples (unrelated scenes):\n' + (request.examples ?? []).map(e => e.line).join('\n') : '') },
            ...(request.model.includes('gpt-oss') ? [] : request.examples ?? []).flatMap(example => [{ role: 'user' as const, content: `SCENE: ${example.scene}\nWrite the narration JSON.` }, { role: 'assistant' as const, content: JSON.stringify({ line: example.line, chapterTitle: '', castUpdates: [], usedTwistId: '' }) }]),
            { role: 'user', content: request.user + (attempt ? `\nCorrect the previous output: ${invalid instanceof Error ? invalid.message : 'Invalid JSON'}. Return a new, grounded 8–12 word line and the required JSON fields.` : '') },
            ...(request.model.includes('gpt-oss') ? [{ role: 'assistant' as const, content: '{' }] : [])]
        }, signal);
        try {
          const normalized = request.model.includes('gpt-oss') && !text.trimStart().startsWith('{') ? '{' + text : text;
          const narration = parseNarration(normalized);
          if (request.recentLines?.includes(narration.line)) throw new Error('Repeated recent line. Use the latest spoken words and a different concrete detail.');
          return narration;
        } catch (error) { invalid = error; }
      }
      throw new Error(`Invalid model JSON twice: ${invalid instanceof Error ? invalid.message : 'invalid output'}`);
    });
  }
  summarize(facts: string, model: string, signal: AbortSignal) {
    return timed(async () => {
      const text = await this.client.complete({ model, temperature: 0.15, max_tokens: model.includes('gpt-oss') ? 450 : 140,
        ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
        response_format: { type: 'json_schema', json_schema: { name: 'summary', strict: true, schema: { type: 'object', additionalProperties: false, properties: { summary: { type: 'string', minLength: 10, maxLength: 600 } }, required: ['summary'] } } },
        messages: [{ role: 'system', content: 'Summarize only these established story facts in 20–45 words, third person and past tense. Never invent. JSON summary only.' }, { role: 'user', content: facts.slice(-4000) }, ...(model.includes('gpt-oss') ? [{ role: 'assistant' as const, content: '{' }] : [])]
      }, signal);
      const value = (JSON.parse(model.includes('gpt-oss') && !text.trimStart().startsWith('{') ? '{' + text : text) as { summary: unknown }).summary;
      if (typeof value !== 'string' || !value.trim() || wordCount(value) > 120) throw new Error('Invalid rolling summary');
      return value.trim();
    });
  }

}
