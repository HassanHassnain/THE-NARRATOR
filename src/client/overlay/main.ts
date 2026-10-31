import './style.css';
import { connect } from '../socket';
import type { Beat } from '../../shared/protocol';
const el = (id: string) => document.getElementById(id)!;
const audio = el('voice') as HTMLAudioElement;
const enable = el('enable') as HTMLButtonElement;
let current: Beat | undefined; let muted = false; let words: string[] = []; let chapterTimer: ReturnType<typeof setTimeout>; let cardTimer: ReturnType<typeof setTimeout>;
function stop() { audio.pause(); audio.removeAttribute('src'); audio.load(); current = undefined; el('subtitles').textContent = ''; el('chapter').textContent = ''; el('credit').textContent = ''; el('event').textContent = ''; clearTimeout(chapterTimer); clearTimeout(cardTimer); enable.hidden = true; }
async function play(beat: Beat) {
  stop(); if (muted) return; current = beat; words = beat.line.split(/\s+/); audio.src = beat.audioUrl;
  el('genre').textContent = beat.genre.toUpperCase();
  try { await audio.play(); enable.hidden = true; } catch { if (current?.id === beat.id) enable.hidden = false; }
}
audio.onplaying = () => {
  if (!current) return;
  el('subtitles').textContent = words[0] ?? '';
  if (current.chapterChanged && current.chapterTitle) { el('chapter').textContent = current.chapterTitle; clearTimeout(chapterTimer); chapterTimer = setTimeout(() => { el('chapter').textContent = ''; }, 2500); }
  if (current.twist) el('credit').textContent = `PLOT TWIST by @${current.twist.author}: ${current.twist.text}`;
  if (current.event) el('event').textContent = `${current.event.kind.toUpperCase()} · @${current.event.author}`;
  clearTimeout(cardTimer); cardTimer = setTimeout(() => { el('credit').textContent = ''; el('event').textContent = ''; }, 5000);
};
audio.ontimeupdate = () => {
  if (!current) return;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current.durationSeconds;
  const visible = Math.max(1, Math.ceil((audio.currentTime / duration) * words.length));
  // Page by up to 14 words so older text never grows beyond two lines.
  const page = Math.floor(Math.max(0, visible - 1) / 14) * 14;
  el('subtitles').textContent = words.slice(page, Math.min(visible, page + 14)).join(' ');
};
audio.onended = stop;
audio.onerror = () => { if (current) { el('status').textContent = 'Audio could not load. Reopen the overlay from /host.'; enable.hidden = false; } };
enable.onclick = async () => { if (!current || muted) return; try { await audio.play(); enable.hidden = true; } catch { el('status').textContent = 'Audio is blocked. Allow sound in your browser settings.'; } };
connect('overlay', message => {
  if (message.type === 'beat') void play(message.beat);
  if (message.type === 'stop') stop();
  if (message.type === 'state') { muted = message.state.settings.muted || !message.state.settings.running; if (muted) stop(); if (!current) el('genre').textContent = message.state.settings.genre.toUpperCase(); }
}, open => { el('status').textContent = open ? '' : 'Overlay disconnected. Reconnecting… Check the link from /host.'; if (!open) stop(); });
void fetch('/api/config').then(r => r.json()).then((c: { simulated: boolean }) => { el('replay').hidden = !c.simulated; });
