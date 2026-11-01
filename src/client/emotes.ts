// Shared by the overlay, demo and episode pages: emote words become their 7TV/BTTV/Twitch images.
let emotes: Record<string, string> = {};
export async function loadEmotes() {
  emotes = await fetch('/api/emotes').then(r => r.json() as Promise<Record<string, string>>).catch(() => ({}));
}
export function withEmotes(text: string): Node[] {
  return text.split(/(\s+)/u).map(part => {
    const bare = part.replace(/[.,!?…]+$/u, ''); const url = Object.hasOwn(emotes, bare) && typeof emotes[bare] === 'string' ? emotes[bare] : undefined;
    if (!url) return document.createTextNode(part);
    const img = document.createElement('img'); img.className = 'emote'; img.src = url; img.alt = bare; img.title = bare;
    const punctuation = part.slice(bare.length);
    if (!punctuation) return img;
    const wrap = document.createElement('span'); wrap.append(img, punctuation); return wrap;
  });
}
