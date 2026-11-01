import './style.css';
import { connect } from '../socket';
import type { PublicState, Settings, ClientMessage } from '../../shared/protocol';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
let state: PublicState | undefined; let listening = false;
const socket = connect('host', message => {
  if (message.type === 'state') { state = message.state; render(state); }
  if (message.type === 'notice') el('notice').textContent = message.message;
}, open => {
  el('connection').textContent = open ? 'Control room connected' : 'Reconnecting…';
  // After a server restart, tell it the microphone is still listening.
  if (open && listening) socket.send({ type: 'mic', active: true });
});
const settings = (value: Partial<Settings>) => socket.send({ type: 'settings', settings: value });
function render(s: PublicState) {
  const checks: [string, boolean][] = [['Ollama running', s.health.ollama], ['Models installed', s.health.ollama && !s.health.missing.length], ['Voice ready', s.voice.ready], ['Narrator can see', Date.now() - s.frameAt < 5000], ['Microphone on', s.mic], ['Overlay connected', s.overlays > 0], ['Twitch connected', s.twitch.chatConnected]];
  el('checklist').replaceChildren(...checks.map(([label, ready]) => { const li = document.createElement('li'); li.className = ready ? 'ready' : 'pending'; li.textContent = `${ready ? '✓' : '○'} ${label}`; return li; }));
  el('fixes').textContent = [...s.health.fixes, s.voice.error ?? ''].filter(Boolean).join('\n');
  el<HTMLAnchorElement>('overlay').href = `/overlay?key=${encodeURIComponent(s.overlayKey)}`;
  el<HTMLAnchorElement>('episode').href = `/episode/${encodeURIComponent(s.story.streamId)}`;
  for (const [id, value] of [['protagonist', s.settings.protagonist], ['genre', s.settings.genre], ['cadence', String(s.settings.cadenceSeconds)], ['spice', String(s.settings.spice)]] as const) if (document.activeElement !== el(id)) input(id).value = value;
  el('cadenceValue').textContent = `${s.settings.cadenceSeconds} s`; el('spiceValue').textContent = String(s.settings.spice);
  input('light').checked = s.settings.lightMode;
  button('running').textContent = s.settings.running ? 'Stop narrator' : 'Start narrator';
  button('running').disabled = !s.settings.running && (!s.voice.ready || !s.health.ollama || s.health.missing.length > 0);
  button('mute').setAttribute('aria-pressed', String(s.settings.muted));
  const t = s.twitch;
  el('twitchStatus').textContent = `${t.channel ? '#' + t.channel : 'No channel'} · chat ${t.chatConnected ? 'connected' : 'disconnected'} · events ${t.eventsConnected ? 'connected' : 'disconnected'}${t.user ? ' · authorized as ' + t.user.login : ''}`;
  el('twitchSetup').textContent = t.clientConfigured ? 'Authorize to receive follows, subscriptions, cheers and raids on your channel.' : 'For events: set TWITCH_CLIENT_ID for a Public app in .env, restart, then Connect with Twitch. Anonymous chat needs no client ID.';
  if (document.activeElement !== el('channel')) input('channel').value = t.channel;
  el('device').hidden = !t.device; el('deviceCode').textContent = t.device?.userCode ?? '';
  el<HTMLSelectElement>('twistMode').value = t.mode; input('modsOnly').checked = t.modsOnly;
  el('acceptedTwists').textContent = `${t.accepted.length}/3 accepted twists waiting for a beat.`;
  if (document.activeElement !== el('blocklist')) el<HTMLTextAreaElement>('blocklist').value = t.blocklist.join('\n');
  el('pendingTwists').replaceChildren(...t.pending.map(twist => {
    const li = document.createElement('li'); const text = document.createElement('span'); text.textContent = `@${twist.author}: ${twist.text} `;
    const approve = document.createElement('button'); approve.textContent = 'Approve'; approve.onclick = () => twitch({ action: 'approve', id: twist.id });
    const reject = document.createElement('button'); reject.textContent = 'Reject'; reject.onclick = () => twitch({ action: 'reject', id: twist.id }); li.append(text, approve, reject); return li;
  }));
  el('twitchNotices').replaceChildren(...t.notices.map(notice => { const li = document.createElement('li'); li.textContent = notice; return li; }));
  el('logs').replaceChildren(...s.logs.map(log => {
    const li = document.createElement('li'); li.className = log.status;
    const head = document.createElement('div'); head.className = 'head';
    const trigger = document.createElement('span'); trigger.className = 'trigger'; trigger.textContent = log.trigger;
    const when = document.createElement('span'); when.textContent = `${new Date(log.at).toLocaleTimeString()} · ${(log.latency.total / 1000).toFixed(1)} s`;
    head.append(trigger, when);
    const line = document.createElement('strong'); line.textContent = log.status === 'spoken' ? log.line : log.reason ?? 'Skipped';
    const caption = document.createElement('small'); caption.className = 'scene'; caption.textContent = `Saw: ${log.caption || 'no caption'}`;
    const bar = document.createElement('div'); bar.className = 'bar'; bar.title = 'see · write · voice';
    const total = Math.max(1, log.latency.total);
    for (const part of ['eyes', 'writer', 'tts'] as const) { const seg = document.createElement('i'); seg.className = part; seg.style.width = `${(log.latency[part] / total) * 100}%`; bar.append(seg); }
    const times = document.createElement('small'); times.className = 'times'; times.textContent = `see ${log.latency.eyes} · write ${log.latency.writer} · voice ${log.latency.tts} ms · ${log.engine ?? 'no audio'}`;
    li.append(head, line, caption, bar, times); return li;
  }));
  const spoken = s.logs.find(log => log.status === 'spoken');
  el('nowLine').textContent = spoken?.line ?? (s.settings.running ? 'Listening for something worth saying…' : 'The narrator is waiting for something worth saying.');
  el('nowMeta').textContent = spoken ? `${s.settings.genre} · ${spoken.trigger} · ${new Date(spoken.at).toLocaleTimeString()}` : '';
  el('nowLine').parentElement!.classList.toggle('idle', !spoken);
  const live = s.settings.running && !s.settings.muted;
  el('onair').textContent = s.settings.muted && s.settings.running ? 'Muted' : live ? 'On air' : 'Off air';
  el('onair').classList.toggle('live', live);
  button('running').classList.toggle('stop', s.settings.running);
  button('mute').innerHTML = `${s.settings.muted ? 'Unmute' : 'Mute'} <kbd>M</kbd>`;
  const obsLive = s.obs.connected && Date.now() - s.obs.lastFrameAt < 5000;
  el('screen').classList.toggle('live', obsLive || (!!capture && capture.active));
  el<HTMLImageElement>('eyes').hidden = !obsLive;
  video.hidden = obsLive;
  el('eyesSource').textContent = obsLive ? `Seeing OBS layer “${s.obs.source}” only` : capture?.active ? 'Seeing your shared window' : '';
  if (s.obs.configured && s.obs.error && !capture?.active) el('fixes').textContent = [el('fixes').textContent, s.obs.error].filter(Boolean).join('\n');
  for (const tile of el('genreTiles').children) tile.setAttribute('aria-checked', String((tile as HTMLElement).dataset.genre === s.settings.genre));
}
const genreBlurbs: Record<Settings['genre'], string> = { noir: 'weary detective', nature: 'wildlife documentary', epic: 'ancient legend', sports: 'play-by-play', horror: 'campfire dread', heist: 'plan gone wrong', unhinged: 'talks like chat' };
el('genreTiles').replaceChildren(...(Object.keys(genreBlurbs) as Settings['genre'][]).map(genre => {
  const tile = document.createElement('button'); tile.type = 'button'; tile.className = `tile ${genre}`; tile.dataset.genre = genre;
  tile.setAttribute('role', 'radio'); tile.setAttribute('aria-checked', 'false');
  const name = document.createElement('b'); name.textContent = genre[0]!.toUpperCase() + genre.slice(1);
  const blurb = document.createElement('span'); blurb.textContent = genreBlurbs[genre];
  tile.append(name, blurb);
  tile.onclick = () => { el<HTMLSelectElement>('genre').value = genre; settings({ genre }); };
  return tile;
}));
if (state) render(state);
input('protagonist').onchange = () => settings({ protagonist: input('protagonist').value });
el<HTMLSelectElement>('genre').onchange = () => settings({ genre: el<HTMLSelectElement>('genre').value as Settings['genre'] });
input('cadence').oninput = () => { el('cadenceValue').textContent = `${input('cadence').value} s`; };
input('cadence').onchange = () => settings({ cadenceSeconds: Number(input('cadence').value) });
input('spice').oninput = () => { el('spiceValue').textContent = input('spice').value; };
input('spice').onchange = () => settings({ spice: Number(input('spice').value) });
input('light').onchange = () => settings({ lightMode: input('light').checked });
button('running').onclick = () => settings({ running: !state?.settings.running });
button('mute').onclick = () => settings({ muted: !state?.settings.muted });
button('skip').onclick = () => socket.send({ type: 'skip' });
button('warm').onclick = () => socket.send({ type: 'warm' });
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable))) return;
  if (event.key.toLowerCase() === 'm') button('mute').click();
  if (event.key.toLowerCase() === 's') button('skip').click();
});
el<HTMLFormElement>('transcriptForm').onsubmit = event => { event.preventDefault(); socket.send({ type: 'transcript', text: input('transcript').value, at: Date.now() }); input('transcript').value = ''; };
let capture: MediaStream | undefined; let frameTimer: ReturnType<typeof setInterval> | undefined;
const video = el<HTMLVideoElement>('preview');
const canvas = document.createElement('canvas');
function stopCapture() { if (frameTimer) clearInterval(frameTimer); frameTimer = undefined; capture?.getTracks().forEach(t => t.stop()); capture = undefined; video.srcObject = null; button('capture').textContent = 'Share a window instead'; if (state) render(state); }
button('capture').onclick = async () => {
  if (capture) { stopCapture(); return; }
  try {
    capture = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    video.srcObject = capture; await video.play(); button('capture').textContent = 'Stop sharing';
    capture.getVideoTracks()[0]!.onended = stopCapture;
    const frame = () => { if (!video.videoWidth) return; canvas.width = 768; canvas.height = Math.round(video.videoHeight * 768 / video.videoWidth); canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height); socket.send({ type: 'frame', jpeg: canvas.toDataURL('image/jpeg', 0.7) }); };
    frame(); frameTimer = setInterval(frame, 1000); if (state) render(state);
  } catch (error) { el('notice').textContent = `Screen sharing did not start: ${error instanceof Error ? error.message : 'permission needed'}`; stopCapture(); }
};
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void;
}
const Speech = (window as unknown as { webkitSpeechRecognition?: new () => Recognition; SpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
let recognition: Recognition | undefined; let micWanted = false;
button('mic').onclick = () => {
  if (!Speech) { el('speechStatus').textContent = 'Speech recognition unavailable. Use Chrome or the transcript fallback.'; return; }
  micWanted = !micWanted; remember('narrator.mic', micWanted ? 'on' : 'off');
  if (!micWanted) { recognition?.stop(); socket.send({ type: 'mic', active: false }); button('mic').textContent = 'Enable microphone'; return; }
  recognition = new Speech(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
  recognition.onstart = () => { listening = true; socket.send({ type: 'mic', active: true }); el('speechStatus').textContent = 'Listening… Say “narrator” for a reply.'; button('mic').textContent = 'Stop microphone'; };
  recognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      if (result.isFinal) socket.send({ type: 'transcript', text: result[0].transcript, at: Date.now() }); else interim += result[0].transcript;
    }
    if (interim) el('speechStatus').textContent = interim;
  };
  recognition.onerror = event => {
    el('speechStatus').textContent = `Microphone: ${event.error}. Click to restart, or use the transcript fallback.`;
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) { micWanted = false; button('mic').textContent = 'Enable microphone'; }
  };
  recognition.onend = () => {
    listening = false; socket.send({ type: 'mic', active: false });
    if (micWanted) setTimeout(() => { if (micWanted) { try { recognition?.start(); } catch { el('speechStatus').textContent = 'Speech stopped. Turn the microphone off and on to restart.'; } } }, 800);
    else { el('speechStatus').textContent = 'Microphone off'; button('mic').textContent = 'Enable microphone'; }
  };
  try { recognition.start(); } catch { micWanted = false; el('speechStatus').textContent = 'Could not start speech recognition. Use the transcript fallback.'; }
};
// The microphone stays on across reloads (or open /host?mic=on) so a stream can start without clicking through setup again.
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
let micRemembered = new URLSearchParams(location.search).get('mic') === 'on';
try { micRemembered ||= localStorage.getItem('narrator.mic') === 'on'; } catch { /* storage unavailable */ }
if (micRemembered) setTimeout(() => { if (!micWanted) button('mic').click(); }, 1500);
void fetch('/api/config').then(r => r.json()).then((c: { simulated: boolean }) => { el('simulated').hidden = !c.simulated; });
window.addEventListener('pagehide', () => { stopCapture(); micWanted = false; recognition?.stop(); socket.close(); });

function twitch(action: Omit<Extract<ClientMessage, { type: 'twitch' }>, 'type'>) { socket.send({ type: 'twitch', ...action }); }
button('readChat').onclick = () => twitch({ action: 'chat', channel: input('channel').value });
button('authTwitch').onclick = () => twitch({ action: 'auth' });
button('stopChat').onclick = () => twitch({ action: 'stop' });
button('clearTwists').onclick = () => twitch({ action: 'clear' });
el<HTMLSelectElement>('twistMode').onchange = () => twitch({ action: 'mode', mode: el<HTMLSelectElement>('twistMode').value as 'approve' | 'auto', modsOnly: input('modsOnly').checked });
input('modsOnly').onchange = () => twitch({ action: 'mode', modsOnly: input('modsOnly').checked });
button('saveBlocklist').onclick = () => twitch({ action: 'blocklist', words: el<HTMLTextAreaElement>('blocklist').value.split('\n') });

// Refresh the "what the narrator sees" preview from OBS frames.
setInterval(() => { const img = el<HTMLImageElement>('eyes'); if (!img.hidden) img.src = `/api/frame?t=${Date.now()}`; }, 2000);
