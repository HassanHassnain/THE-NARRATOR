/** Small models sometimes leak JSON/HTML into the title; keep only a short, plain title or drop it. */
export function cleanChapterTitle(raw: string): string {
  const title = raw.split(/["“”<>{}\[\]\\|]/u)[0]!.replace(/\s+/gu, ' ').trim().replace(/[,;:\-–—]+$/u, '').trim();
  // The 4B writer sometimes echoes the trigger name ("cadence") or a placeholder instead of a title.
  if (/^(?:cadence|talk-?back|twist|event|hype|recap|transcript|opening|chapter(?: \w+)?|none|empty|null|n\/a|untitled|title)$/iu.test(title)) return '';
  return title && title.length <= 48 && title.split(' ').length <= 7 && /\p{L}/u.test(title) ? title : '';
}
