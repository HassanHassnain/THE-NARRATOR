import { loadEnvFile } from 'node:process';
try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const { createApp } = await import('./app.js');
const app = await createApp(import.meta.url.endsWith('/dist/server/index.js'));
app.server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log(`THE NARRATOR: http://localhost:${process.env.PORT ?? 3000}/host`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => { process.exitCode = 0; }); });
