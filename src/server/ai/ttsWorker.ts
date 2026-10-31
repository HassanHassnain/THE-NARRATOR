import { KokoroTTS } from 'kokoro-js';
let model: Promise<KokoroTTS> | undefined;
process.on('message', async (message: { id: number; line?: string; voice?: string; speed?: number }) => {
  try {
    model ??= (async () => {
      const id = 'onnx-community/Kokoro-82M-v1.0-ONNX';
      const tts = await KokoroTTS.from_pretrained(id, { dtype: 'q8', device: 'cpu' });
      // Kokoro's loader does not forward ONNX thread options. Recreate its public
      // model with a bounded CPU pool, retaining the tokenizer and cached weights.
      const Model = tts.model.constructor as unknown as { from_pretrained(id: string, options: Record<string, unknown>): Promise<KokoroTTS['model']> };
      await tts.model.dispose();
      tts.model = await Model.from_pretrained(id, { dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: Math.max(1, Math.min(4, Number(process.env.TTS_THREADS) || 4)), interOpNumThreads: 1, executionMode: 'sequential' } });
      return tts;
    })();
    const tts = await model;
    if (!message.line) {
      await tts.generate('Ready.', { voice: 'bm_george' });
      process.send?.({ id: message.id, ready: true }); return;
    }
    const audio = await tts.generate(message.line, { voice: message.voice as keyof typeof tts.voices, speed: message.speed ?? 1 });
    process.send?.({ id: message.id, bytes: Buffer.from(audio.toWav()), durationSeconds: audio.audio.length / audio.sampling_rate });
  } catch (error) { process.send?.({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
});
process.on('disconnect', () => process.exit(0));
