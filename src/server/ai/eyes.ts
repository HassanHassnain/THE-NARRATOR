import { eyesModel, wordCount } from '../config.js';
import { timed, type ChatClient, type Eyes } from './interfaces.js';
export class LocalEyes implements Eyes {
  constructor(private client: ChatClient) {}
  caption(frame: Buffer, signal: AbortSignal) {
    return timed(async () => {
      const text = (await this.client.complete({ model: eyesModel(), temperature: 0.1, max_tokens: 40,
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Caption in 8–16 words, at most 25. Visible objects, colours, text only. No guesses or narration.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame.toString('base64')}` } }
        ] }]
      }, signal)).trim();
      if (!text || wordCount(text) > 25) throw new Error('Eyes caption exceeded 25 words or was empty');
      return text;
    });
  }
}
