import type { Settings, StoryEvent, Transcript, Trigger, Twist } from '../../shared/protocol.js';
// Speech-to-text often hears "narrator" as "Nader" with South Asian and other accents.
const wakeVariants = String.raw`\b(?:narrat(?:or|er|ar)|narator|nerator|naretor|narater|narrador|nader|nadir|nadar)\b`;
export const wakeWord = (text: string) => new RegExp(wakeVariants, 'iu').test(text);
/** Misheard spellings become "Narrator", so the writer never addresses the streamer as "Nader". */
export const normalizeWakeWord = (text: string) => text.replace(new RegExp(wakeVariants, 'giu'), 'Narrator');
const priority: StoryEvent['kind'][] = ['raid', 'gift', 'sub', 'cheer', 'follow', 'hype'];
export interface TriggerInput {
  now: number; lastAttempt: number; inFlight: boolean; settings: Settings;
  transcript: Transcript[]; twists: Twist[]; events: StoryEvent[]; recap?: boolean;
}
export function selectTrigger(input: TriggerInput): { trigger: Trigger; event?: StoryEvent; twist?: Twist } | undefined {
  const { now, lastAttempt, inFlight, settings, transcript, twists, events } = input;
  if (inFlight || settings.muted || !settings.running) return;
  if (transcript.some(t => wakeWord(t.text))) return { trigger: 'talk-back' };
  if (now - lastAttempt < 8000) return;
  if (twists[0]) return { trigger: 'twist', twist: twists[0] };
  const event = [...events].sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))[0];
  if (event) return { trigger: 'event', event };
  if (input.recap) return { trigger: 'recap' };
  const recent = transcript.filter(t => now - t.at <= 10000 && t.at <= now);
  if (recent.length >= 3 || recent.some(t => /!|\b(?:ha(?:ha)+|lol|laugh(?:ing|ter)?)\b/iu.test(t.text))) return { trigger: 'transcript' };
  if (now - lastAttempt >= settings.cadenceSeconds * 1000) return { trigger: 'cadence' };
}
