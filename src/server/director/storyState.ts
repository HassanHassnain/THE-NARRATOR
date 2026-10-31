import { randomUUID } from 'node:crypto';
import type { Beat, Genre, Narration, StoryState, Twist } from '../../shared/protocol.js';
export function createStory(protagonist = 'Streamer', genre: Genre = 'noir', streamId = randomUUID()): StoryState {
  return { streamId, protagonist, genre, cast: {}, canon: [], summary: '', recentLines: [], chapterTitle: '', beatCount: 0 };
}
export function applyBeat(state: StoryState, beat: Beat, narration: Narration, twist?: Twist): void {
  state.beatCount++;
  state.genre = beat.genre; state.chapterTitle = beat.chapterTitle;
  state.recentLines = [...state.recentLines, beat.line].slice(-6);
  for (const cast of narration.castUpdates) state.cast[cast.name] = cast.role;
  if (twist && !state.canon.some(t => t.id === twist.id)) state.canon.push(twist);
  if (state.beatCount % 5 === 0) state.summary = [state.summary, ...state.recentLines.slice(-5)].join(' ').trim().split(/\s+/u).slice(-120).join(' ');
}
