export const genres = ['noir', 'nature', 'epic', 'sports', 'horror', 'heist'] as const;
export type Genre = typeof genres[number];
export type Trigger = 'talk-back' | 'twist' | 'event' | 'transcript' | 'cadence' | 'recap';
export interface Transcript { text: string; at: number }
export interface Twist { id: string; author: string; text: string }
export interface StoryEvent { id: string; kind: 'raid' | 'gift' | 'sub' | 'cheer' | 'follow'; author: string; detail: string }
export interface Settings { protagonist: string; genre: Genre; cadenceSeconds: number; spice: number; lightMode: boolean; muted: boolean; running: boolean }
export interface StoryState {
  streamId: string; protagonist: string; genre: Genre; cast: Record<string, string>;
  canon: Twist[]; summary: string; recentLines: string[]; chapterTitle: string; beatCount: number;
}
export interface Narration {
  line: string; chapterTitle?: string; castUpdates: { name: string; role: string }[];
  usedTwistId?: string;
}
export interface Latency { eyes: number; writer: number; tts: number; total: number }
export interface Beat {
  id: string; streamId: string; at: number; trigger: Trigger; genre: Genre;
  caption: string; line: string; chapterTitle: string; chapterChanged: boolean; castUpdates: Narration['castUpdates'];
  twist?: Twist; event?: StoryEvent; latency: Latency; audioUrl: string; frameUrl: string;
  durationSeconds: number; engine: 'kokoro' | 'say' | 'fake'; lightMode: boolean;
}
export interface BeatLog { at: number; status: 'spoken' | 'skipped'; engine?: 'kokoro' | 'say' | 'fake'; trigger: Trigger; reason?: string; caption: string; line: string; latency: Latency }
export interface Health { ollama: boolean; installed: string[]; missing: string[]; fixes: string[]; latencyMs: number; error?: string }
export interface PublicState {
  settings: Settings; story: StoryState; health: Health; voice: { ready: boolean; engine: string; error?: string };
  twitch: TwitchPublic; overlayKey: string; overlays: number; logs: BeatLog[]; frameAt: number; mic: boolean;
}
export type ServerMessage = { type: 'state'; state: PublicState } | { type: 'beat'; beat: Beat } | { type: 'stop' } | { type: 'notice'; message: string };
export type ClientMessage =
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'frame'; jpeg: string }
  | { type: 'transcript'; text: string; at: number }
  | { type: 'mic'; active: boolean }
  | { type: 'skip' }
  | { type: 'warm' }
  | { type: 'twitch'; action: 'chat' | 'auth' | 'stop' | 'approve' | 'reject' | 'clear' | 'mode' | 'blocklist'; channel?: string; id?: string; mode?: 'approve' | 'auto'; modsOnly?: boolean; words?: string[] };

export interface TwitchPublic {
  clientConfigured: boolean; channel: string; chatConnected: boolean; eventsConnected: boolean; authenticated: boolean;
  mode: 'approve' | 'auto'; modsOnly: boolean; pending: Twist[]; accepted: Twist[];
  blocklist: string[]; notices: string[]; device?: { userCode: string; uri: string; expiresAt: number };
  user?: { id: string; login: string; displayName: string };
}
