// Captures README screenshots from a running server (npm run dev or npm start). Usage: npm run screens
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
const base = process.env.BASE_URL ?? 'http://localhost:3000';
await mkdir('data/screens/review', { recursive: true });
const key = (await readFile('data/overlay.key', 'utf8').catch(() => '')).trim();
const deadline = setTimeout(() => { console.error('Screenshots exceeded 18 seconds'); process.exit(1); }, 18000);
const browser = await chromium.launch();
try {
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${base}/host`); await page.locator('#connection').waitFor();
await page.screenshot({ path: 'data/screens/review/control-room.png' });
await page.goto(`${base}/episode/demo`); await page.locator('#story article').first().waitFor();
await page.screenshot({ path: 'data/screens/review/episode.png' });
await page.setViewportSize({ width: 1920, height: 1080 });
const samples = [
  ['epic', 'Lo, the hero consumed his final draught, believing it would grant him victory; it did not.', 'the cat is the real villain'],
  ['sports', 'Three strikes, folks! He confidently declared a masterful display, then achieved a new low.', ''],
  ['nature', 'The specimen lost his only key. A bold migration strategy.', ''],
  ['horror', 'The locked door remained patient. Hassan had already used the potion.', ''],
  ['heist', 'The getaway river took the key before the crew arrived.', ''],
  ['unhinged', 'bro called it a speedrun then donated the key to the river Sadge', ''],
  ['noir', 'Twenty health and no key? That’s how empires fall.', ''],
] as const;
for (const [genre, line, twist] of samples) {
  await page.goto(`${base}/demo`); await page.locator('#play').waitFor();
  // Plain-text script: tsx would otherwise inject helpers that do not exist in the page.
  await page.evaluate(`(() => { const g = ${JSON.stringify(genre)}, l = ${JSON.stringify(line)}, t = ${JSON.stringify(twist)};
    document.getElementById('start').hidden = true;
    const label = document.createElement('p'); label.textContent = 'ILLUSTRATIVE STYLE PREVIEW · scripted text and synthetic frame'; label.style.cssText = 'position:absolute;top:8px;left:16px;color:white;background:#111;padding:8px;z-index:99'; document.getElementById('stage').append(label);
    const apply = () => { document.body.dataset.genre = g; document.getElementById('genre').textContent = g.toUpperCase(); document.getElementById('subtitles').textContent = l; document.getElementById('credit').textContent = t ? '@viewer: ' + t : ''; };
    apply(); setInterval(apply, 50); })()`);
  await page.waitForTimeout(400);
  await (await page.$('#stage'))!.screenshot({ path: `data/screens/review/overlay-${genre}.png` });
}
} finally { await browser.close(); clearTimeout(deadline); }
console.log('Saved labelled previews in data/screens/review/');
