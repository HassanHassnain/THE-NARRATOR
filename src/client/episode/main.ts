import { cleanChapterTitle as cleanTitle } from '../../shared/chapter';
import './style.css';
import css from './style.css?raw';
import type { Beat, Genre } from '../../shared/protocol';
import { loadEmotes, withEmotes } from '../emotes';

interface EpisodeSummary { id: string; beats: number; at: number; protagonist: string }
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const titles: Record<Genre, (name: string) => string> = {
  noir: n => `The ${n} Files`, nature: n => `${n}: A Field Study`, epic: n => `The Legend of ${n}`,
  sports: n => `${n}: Match Day`, horror: n => `What ${n} Found`, heist: n => `The ${n} Job`, unhinged: n => `${n} Is So Cooked`
};
const dominant = (beats: Beat[]): Genre => {
  const count = new Map<Genre, number>(); for (const b of beats) count.set(b.genre, (count.get(b.genre) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ('noir' as Genre);
};
const roleFor = (b: Beat) => b.event ? ({ follow: 'arrived with a follow', sub: 'subscribed', gift: 'gifted subs', cheer: 'cheered bits', raid: 'led a raid', hype: '' } as const)[b.event.kind] : '';

function castOf(beats: Beat[]) {
  const cast = new Map<string, string>();
  for (const b of beats) {
    for (const update of b.castUpdates) cast.set(update.name, update.role);
    if (b.twist) cast.set(b.twist.author, 'wrote a plot twist');
    if (b.event && b.event.kind !== 'hype' && b.event.author && !cast.has(b.event.author)) cast.set(b.event.author, roleFor(b));
  }
  return cast;
}

function chapters(beats: Beat[]) {
  const out: { title: string; beats: Beat[] }[] = [];
  for (const beat of beats) {
    const title = beat.chapterChanged ? cleanTitle(beat.chapterTitle) : '';
    if (!out.length || title) out.push({ title: title || 'Prologue', beats: [] });
    out.at(-1)!.beats.push(beat);
  }
  return out;
}

let activeAudio: HTMLAudioElement | undefined;
function render(beats: Beat[], streamId: string) {
  const name = beats.find(b => b.protagonist)?.protagonist || 'Streamer';
  const genre = dominant(beats);
  const twists = beats.filter(b => b.twist).length;
  el('title').textContent = titles[genre](name);
  document.title = `${titles[genre](name)} · THE NARRATOR`;
  el('subtitle').textContent = beats.length
    ? `${new Date(beats[0]!.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} · ${beats.length} recorded lines${twists ? ` · ${twists} plot twist${twists > 1 ? 's' : ''} from chat` : ''}`
    : '';
  if (beats.some(b => b.source === 'model-check')) el('subtitle').textContent += ' · MODEL CHECK · synthetic inputs';
  else if (beats.some(b => b.source === 'simulated')) el('subtitle').textContent += ' · SIMULATED TEST';
  el('empty').hidden = beats.length > 0;
  el<HTMLButtonElement>('card').disabled = !beats.length; el<HTMLButtonElement>('export').disabled = !beats.length;
  el('story').replaceChildren(...chapters(beats).map((chapter, index) => {
    const section = document.createElement('section'); section.className = 'chapter';
    const number = document.createElement('h2'); number.textContent = `Chapter ${index + 1}`;
    const heading = document.createElement('h3'); heading.textContent = chapter.title;
    section.append(number, heading);
    for (const beat of chapter.beats) {
      const article = document.createElement('article'); article.className = 'beat';
      let picture: HTMLElement;
      if (beat.frameUrl) { const img = document.createElement('img'); img.src = beat.frameUrl; img.alt = beat.caption || 'Stream frame'; img.loading = 'lazy'; picture = img; }
      else { picture = document.createElement('div'); picture.className = 'noimg'; }
      const body = document.createElement('div');
      const quote = document.createElement('blockquote'); quote.append(...withEmotes(beat.line));
      const meta = document.createElement('div'); meta.className = 'meta';
      const time = document.createElement('span'); time.textContent = new Date(beat.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = beat.genre;
      const trigger = document.createElement('span'); trigger.className = 'tag'; trigger.textContent = beat.trigger === 'talk-back' ? 'talked back' : beat.event?.kind === 'hype' ? 'chat reacted' : beat.trigger;
      meta.append(time, tag, trigger);
      if (beat.audioUrl) {
        const play = document.createElement('button'); play.className = 'play'; play.textContent = '▶ Hear it';
        play.dataset.audio = beat.audioUrl;
        play.onclick = () => { activeAudio?.pause(); activeAudio = new Audio(beat.audioUrl); void activeAudio.play().catch(() => { play.textContent = 'Audio unavailable'; }); };
        meta.append(play);
      }
      body.append(quote, meta);
      if (beat.twist) { const t = document.createElement('p'); t.className = 'twist'; const b = document.createElement('b'); b.textContent = 'PLOT TWIST '; t.append(b, `by @${beat.twist.author}: “${beat.twist.text}”`); body.append(t); }
      if (beat.event) { const e = document.createElement('p'); e.className = 'event'; if (beat.event.kind === 'hype') e.append('Chat reacted: ', ...withEmotes(beat.event.detail)); else e.textContent = `@${beat.event.author} ${roleFor(beat)}`; body.append(e); }
      article.append(picture, body); section.append(article);
    }
    return section;
  }));
  const cast = castOf(beats);
  el('castSection').hidden = cast.size === 0;
  el('cast').replaceChildren(...[...cast.entries()].map(([who, role]) => {
    const li = document.createElement('li'); const a = document.createElement('a');
    a.href = `https://www.twitch.tv/${encodeURIComponent(who.toLowerCase())}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `@${who}`;
    const small = document.createElement('small'); small.textContent = role; li.append(a, small); return li;
  }));
  el<HTMLButtonElement>('card').onclick = () => void downloadCard(beats, name, genre, streamId);
  el<HTMLButtonElement>('export').onclick = () => void downloadHtml(streamId);
}

function featured(beats: Beat[]) {
  const ranked = [...beats].sort((a, b) => score(b) - score(a));
  const picked: Beat[] = [];
  for (const beat of ranked) if (picked.length < 3 && !picked.some(p => p.line === beat.line)) picked.push(beat);
  return picked.sort((a, b) => a.at - b.at);
  function score(b: Beat) { return (b.twist ? 3 : 0) + (b.trigger === 'talk-back' ? 2 : 0) + (b.event ? 1 : 0) + Math.min(b.line.length, 120) / 120; }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > width && line) { lines.push(line); line = word; } else line = test; }
  if (line) lines.push(line); return lines;
}

async function downloadCard(beats: Beat[], name: string, genre: Genre, streamId: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#15130f'; ctx.fillRect(0, 0, 1080, 1350);
  const hero = beats.find(b => b.frameUrl);
  if (hero) {
    const img = new Image(); img.src = hero.frameUrl; await img.decode().catch(() => undefined);
    if (img.naturalWidth) { ctx.globalAlpha = .35; const h = 1080 * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, 0, 0, 1080, h); ctx.globalAlpha = 1; const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#15130f00'); g.addColorStop(1, '#15130f'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, h); }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0aa4d'; ctx.font = '600 26px system-ui'; ctx.fillText('THE NARRATOR PRESENTS', 540, 120);
  ctx.fillStyle = '#ece4d4'; ctx.font = '600 76px Georgia, serif';
  wrap(ctx, titles[genre](name), 940).slice(0, 3).forEach((l, i) => ctx.fillText(l, 540, 220 + i * 86, 940));
  let y = 470; ctx.textAlign = 'left';
  for (const beat of featured(beats)) {
    ctx.fillStyle = '#e0aa4d'; ctx.font = '700 64px Georgia, serif'; ctx.fillText('“', 80, y + 30);
    ctx.fillStyle = '#ece4d4'; ctx.font = 'italic 40px Georgia, serif';
    const available = Math.max(0, Math.floor((1140 - y) / 52) - (beat.twist ? 1 : 0));
    if (!available) break;
    const all = wrap(ctx, beat.line, 860); const lines = all.slice(0, available);
    if (all.length > lines.length) lines[lines.length - 1] += '…';
    lines.forEach((l, i) => ctx.fillText(l, 130, y + i * 52, 860)); y += lines.length * 52;
    if (beat.twist) { ctx.fillStyle = '#b190ff'; ctx.font = '600 26px system-ui'; ctx.fillText(`plot twist by @${beat.twist.author}`, 130, y + 8, 860); y += 40; }
    y += 56; if (y > 1150) break;
  }
  const cast = [...castOf(beats).keys()];
  ctx.textAlign = 'center'; ctx.fillStyle = '#a59a87'; ctx.font = '26px system-ui';
  if (cast.length) ctx.fillText(`Written with ${cast.slice(0, 4).map(c => '@' + c).join(', ')}`, 540, 1240, 940);
  const sourceLabel = beats.some(b => b.source === 'model-check') ? 'MODEL CHECK · SYNTHETIC INPUTS' : beats.some(b => b.source === 'simulated') ? 'SIMULATED TEST' : 'RECORDED NARRATION';
  ctx.fillText(`${beats.length} lines · ${sourceLabel}`, 540, 1285, 940);
  const link = document.createElement('a'); link.download = `narrator-${streamId.slice(0, 8)}.png`; link.href = canvas.toDataURL('image/png'); link.click();
}

async function dataUrl(url: string) {
  const response = await fetch(url); if (!response.ok) throw new Error('Media unavailable');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

async function inlineImages(root: HTMLElement) {
  for (const img of root.querySelectorAll('img')) {
    try { img.src = await dataUrl(img.src); }
    catch { img.replaceWith(document.createTextNode(img.alt)); }
  }
}

async function downloadHtml(streamId: string) {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelector('.actions')?.remove(); clone.querySelectorAll('script').forEach(n => n.remove());
  for (const button of clone.querySelectorAll<HTMLButtonElement>('.play')) {
    const audio = document.createElement('audio'); audio.controls = true;
    try { audio.src = await dataUrl(button.dataset.audio!); button.replaceWith(audio); }
    catch { button.replaceWith(document.createTextNode('Audio unavailable')); }
  }
  await inlineImages(clone);
  const exported = document.implementation.createHTMLDocument(document.title);
  exported.documentElement.lang = 'en';
  const charset = exported.createElement('meta'); charset.setAttribute('charset', 'utf-8');
  const viewport = exported.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
  const style = exported.createElement('style'); style.textContent = css;
  exported.head.append(charset, viewport, style); exported.body.replaceWith(clone);
  const html = '<!doctype html>' + exported.documentElement.outerHTML;
  const link = document.createElement('a'); link.download = `narrator-episode-${streamId.slice(0, 8)}.html`;
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function main() {
  await loadEmotes();
  const requested = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
  const episodes = await fetch('/api/episodes').then(r => r.json() as Promise<EpisodeSummary[]>).catch(() => []);
  const streamId = requested && requested !== 'latest' ? requested : episodes[0]?.id ?? '';
  const picker = el<HTMLSelectElement>('picker');
  const options = [...(streamId === 'demo' ? [{ id: 'demo', beats: 0, at: 0, protagonist: 'Recorded demo' }] : []), ...episodes];
  picker.replaceChildren(...options.map(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.id === 'demo' ? 'Recorded demo session' : `${e.protagonist || 'Stream'} · ${new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${e.beats} lines`; return o; }));
  picker.value = streamId; picker.hidden = options.length < 2;
  picker.onchange = () => { location.href = `/episode/${encodeURIComponent(picker.value)}`; };
  if (!streamId) { render([], ''); return; }
  const source = streamId === 'demo' ? '/api/demo' : `/api/episode/${encodeURIComponent(streamId)}`;
  const beats = await fetch(source).then(r => r.ok ? r.json() as Promise<Beat[]> : []).catch(() => [] as Beat[]);
  render(beats, streamId);
  if (streamId === 'demo') {
    const info = await fetch('/api/demo-info').then(r => r.json()).catch(() => ({ label: 'Recorded session · input provenance unverified' }));
    el('subtitle').textContent += ` · ${info.label ?? 'Input provenance unverified'}`;
  }
}
void main();
