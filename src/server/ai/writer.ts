import { cleanChapterTitle } from '../../shared/chapter.js';
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
/** Keeps whole sentences up to maxWords, so a long line still fits two subtitle lines; one over-long sentence is rejected. */
export function fitSentences(line: string, maxWords: number): string {
  if (wordCount(line) <= maxWords) return line;
  const sentences = line.match(/[^.!?…]+[.!?…]+["'”’]?/gu) ?? [line];
  let kept = '';
  for (const sentence of sentences) { const next = (kept + ' ' + sentence.trim()).trim(); if (wordCount(next) > maxWords) break; kept = next; }
  if (!kept) throw new Error(`Use at most ${maxWords} words.`);
  return kept;
}
export function parseNarration(text: string, chatStyle = false, maxWords = 30): Narration {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected narration object');
  const v = value as Record<string, unknown>;
  if (typeof v.line !== 'string' || !v.line.trim() || wordCount(v.line) > 30 || v.line.length > 500) throw new Error('Narration must contain 1–30 words');
  // A cut-off line has no closing punctuation. Chat-style lines may end in an emote, so they only need to be clearly under the length cap.
  if (!/[.!?…][\"'”’]?$/.test(v.line.trim()) && !(chatStyle && v.line.trim().length < 140)) throw new Error('Finish the sentence; use fewer words so it fits the schema.');
  if (!Array.isArray(v.castUpdates) || v.castUpdates.length > 10 || v.castUpdates.some(c => !c || typeof c.name !== 'string' || typeof c.role !== 'string' || c.name.length > 80 || c.role.length > 120)) throw new Error('Invalid cast updates');
  for (const key of ['chapterTitle', 'usedTwistId']) if (v[key] !== undefined && typeof v[key] !== 'string') throw new Error(`Invalid ${key}`);
  if (typeof v.chapterTitle === 'string' && v.chapterTitle.length > 100) throw new Error('Chapter title too long');
  const chapterTitle = typeof v.chapterTitle === 'string' ? cleanChapterTitle(v.chapterTitle) : '';
  return {
    // Markdown emphasis (*playing*) would be read aloud as "asterisk".
    line: chatStyle ? v.line.trim().replace(/\*+/gu, '') : fitSentences(v.line.trim().replace(/\*+/gu, ''), maxWords), castUpdates: v.castUpdates as Narration['castUpdates'],
    ...(chapterTitle ? { chapterTitle } : {}),
    ...(v.usedTwistId ? { usedTwistId: v.usedTwistId as string } : {})
  };
}
export { cleanChapterTitle } from '../../shared/chapter.js';
const fillerWords = new Set(['that', 'this', 'with', 'they', 'them', 'were', 'have', 'been', 'from', 'into', 'their', 'there', 'what', 'when', 'will', 'would', 'about', 'after', 'just', 'like', 'your', 'actually', 'secretly', 'really']);
/** Counts sentences by end punctuation. Intl.Segmenter skips a break before a lowercase word, so chat-style recaps counted as one sentence. */
export const sentenceCount = (text: string) => text.split(/(?<=[.!?…])\s+/u).filter(part => /\p{L}/u.test(part)).length;
/** True when the line uses a key word of the twist, compared on its first five letters so "coups" or "planned" still count. */
export function mentionsTwist(line: string, twist: string) {
  const stems = (text: string) => new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(word => !fillerWords.has(word)).map(word => word.slice(0, 5)));
  const key = stems(twist); if (!key.size) return true;
  const said = stems(line); return [...key].some(word => said.has(word));
}
export class LocalWriter implements Writer {
  constructor(private client: ChatClient) {}
  write(request: WriteRequest, signal: AbortSignal) {
    return timed(async () => {
      let invalid: unknown;
      // Gemma decodes ~10 tokens/s on a 24 GB M5: asking only for line + chapterTitle halves the output.
      // Omit cast updates on this path; require the model to acknowledge any accepted twist.
      const compact = !request.model.includes('gpt-oss');
      for (let attempt = 0; attempt < 2; attempt++) {
        const schema: Record<string, unknown> = compact
          ? { type: 'object', additionalProperties: false, properties: { line: narrationSchema.properties.line, chapterTitle: narrationSchema.properties.chapterTitle }, required: ['line', 'chapterTitle'] }
          : structuredClone(narrationSchema);
        const constrained = schema.properties as Record<string, unknown>;
        if (!compact) constrained.usedTwistId = { type: 'string', enum: [request.twistId ?? ''] };
        if (!compact && !request.allowCast) constrained.castUpdates = { type: 'array', maxItems: 0, items: narrationSchema.properties.castUpdates.items };
        if (compact && request.twistId) {
          constrained.usedTwistId = { type: 'string', enum: [request.twistId] };
          (schema.required as string[]).push('usedTwistId');
        }
        const text = await this.client.complete({
          model: request.model, temperature: request.model.includes('gpt-oss') ? 0.65 : 0.9, max_tokens: request.model.includes('gpt-oss') ? 700 : 120,
          ...(request.model.includes('gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
          response_format: { type: 'json_schema', json_schema: { name: 'narration', strict: true, schema } },
          messages: [{ role: 'system', content: request.system + (request.model.includes('gpt-oss') ? '\nStyle examples (unrelated scenes):\n' + (request.examples ?? []).map(e => e.line).join('\n') : '') },
            ...(request.model.includes('gpt-oss') ? [] : request.examples ?? []).flatMap(example => [{ role: 'user' as const, content: `SCENE: ${example.scene}\nWrite the narration JSON.` }, { role: 'assistant' as const, content: JSON.stringify({ line: example.line, chapterTitle: '', castUpdates: [], usedTwistId: '' }) }]),
            { role: 'user', content: request.user + (attempt ? `\nCorrect the previous output: ${invalid instanceof Error ? invalid.message : 'Invalid JSON'}. Return a new, grounded 8–12 word line and the required JSON fields.` : '') },
            ...(request.model.includes('gpt-oss') ? [{ role: 'assistant' as const, content: '{' }] : [])]
        }, signal);
        try {
          let normalized = request.model.includes('gpt-oss') && !text.trimStart().startsWith('{') ? '{' + text : text;
          if (compact) {
            const compactValue: unknown = JSON.parse(normalized);
            if (!compactValue || typeof compactValue !== 'object' || Array.isArray(compactValue)) throw new Error('Expected narration object');
            const output = compactValue as Record<string, unknown>;
            if (request.twistId && output.usedTwistId !== request.twistId) throw new Error('Confirm the accepted twist ID only after using its plot in the line');
            if (!request.twistId && output.usedTwistId) throw new Error('Writer referenced an unknown twist');
            normalized = JSON.stringify({ ...output, castUpdates: [] });
          }
          const narration = parseNarration(normalized, request.chatStyle, request.maxWords);
          if (request.twistText && !mentionsTwist(narration.line, request.twistText)) throw new Error(`The line must reveal the plot twist itself: "${request.twistText.slice(0, 120)}"`);
          if (request.recap && (sentenceCount(narration.line) !== 2 || narration.line.split(/\s+/u).length < 12)) throw new Error('Recap must contain exactly two short complete sentences, 12 to 30 words total, telling the story so far.');
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
