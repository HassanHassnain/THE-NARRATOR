import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function stableOverlayKey(file: string, fake = false): Promise<string> {
  if (fake) return randomBytes(24).toString('hex');
  const read = async () => {
    const value = (await readFile(file, 'utf8')).trim();
    if (!/^[a-f0-9]{48}$/.test(value)) throw new Error('Invalid data/overlay.key; preserve it and restore a valid 48-character key.');
    await chmod(file, 0o600); return value;
  };
  try { return await read(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, randomBytes(24).toString('hex'), { flag: 'wx', mode: 0o600 });
    try { await link(temporary, file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  } finally { await unlink(temporary).catch(() => undefined); }
  return read();
}
