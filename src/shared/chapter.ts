/** Small models sometimes leak JSON/HTML into the title; keep only a short, plain title or drop it. */
export function cleanChapterTitle(raw: string): string {
  const title = raw.split(/["“”<>{}\[\]\\|]/u)[0]!.replace(/\s+/gu, ' ').trim().replace(/[,;:\-–—]+$/u, '').trim();
  return title && title.length <= 48 && title.split(' ').length <= 7 && /\p{L}/u.test(title) ? title : '';
}
