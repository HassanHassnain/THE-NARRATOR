import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export const scopes = ['user:read:chat', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read', 'channel:manage:broadcast'];
export interface Tokens { access_token: string; refresh_token: string; expiresAt: number }
export interface TwitchUser { id: string; login: string; displayName: string }
export class DeviceAuth {
  private tokens: Tokens | undefined; private refreshPromise: Promise<string> | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | undefined; private validationTimer: ReturnType<typeof setInterval> | undefined;
  private epoch = 0; user: TwitchUser | undefined;
  device: { userCode: string; uri: string; expiresAt: number } | undefined;
  constructor(private clientId: string, private changed: () => void, private notice: (message: string) => void, private file = 'data/tokens.json', private http: typeof fetch = fetch) {}
  get configured() { return !!this.clientId; }
  private async save(value: Tokens) {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file+'.tmp', JSON.stringify(value), { mode: 0o600 }); await chmod(this.file+'.tmp', 0o600); await rename(this.file+'.tmp', this.file); this.tokens = value;
  }
  private async form(path: string, values: Record<string,string>) {
    return this.http(`https://id.twitch.tv/oauth2/${path}`, { method: 'POST', body: new URLSearchParams(values), signal: AbortSignal.timeout(8000) });
  }
  async restore() {
    if (!this.clientId) return;
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as Tokens;
      if (typeof saved.access_token !== 'string' || typeof saved.refresh_token !== 'string' || !Number.isFinite(saved.expiresAt)) throw new Error('Invalid saved Twitch session');
      this.tokens = saved; await this.validate();
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.notice('Saved Twitch session is unavailable. Connect with Twitch again.'); }
    this.validationTimer = setInterval(() => { void this.validate().catch(() => { this.user = undefined; this.changed(); this.notice('Twitch session expired. Connect again.'); }); }, 3600000);
  }
  async begin() {
    if (!this.clientId) throw new Error('Set TWITCH_CLIENT_ID for a registered public Twitch application in .env, then restart.');
    this.epoch++; const epoch = this.epoch; if (this.pollTimer) clearTimeout(this.pollTimer);
    const response = await this.form('device', { client_id: this.clientId, scopes: scopes.join(' ') });
    if (!response.ok) throw new Error(`Twitch device authorization failed (${response.status}). Check that the client is Public.`);
    const code = await response.json() as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
    if (!code.device_code || !code.user_code || !Number.isFinite(code.expires_in)) throw new Error('Invalid Twitch device-code response');
    this.device = { userCode: code.user_code, uri: 'https://www.twitch.tv/activate', expiresAt: Date.now()+code.expires_in*1000 }; this.changed();
    let interval = Math.max(5, code.interval || 5) * 1000;
    const poll = async () => {
      if (epoch !== this.epoch) return;
      if (!this.device || Date.now() >= this.device.expiresAt) { this.device = undefined; this.changed(); this.notice('Twitch code expired. Connect again.'); return; }
      try {
        const token = await this.form('token', { client_id: this.clientId, scopes: scopes.join(' '), device_code: code.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
        const body = await token.json() as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string; error?: string };
        if (epoch !== this.epoch) return;
        if (token.ok && body.access_token && body.refresh_token && body.expires_in) {
          await this.save({ access_token: body.access_token, refresh_token: body.refresh_token, expiresAt: Date.now()+body.expires_in*1000 });
          this.device = undefined; await this.validate(); this.changed(); return;
        }
        const error = body.message ?? body.error ?? '';
        if (/slow_down/.test(error)) interval += 5000;
        else if (!/authorization_pending|authorization pending/i.test(error)) throw new Error('Twitch authorization denied or expired. Connect again.');
      } catch (error) { this.device = undefined; this.notice(error instanceof Error ? error.message : 'Twitch authorization failed'); this.changed(); return; }
      this.pollTimer = setTimeout(() => { void poll(); }, interval);
    };
    this.pollTimer = setTimeout(() => { void poll(); }, interval);
  }
  async token(forceRefresh = false): Promise<string> {
    if (!this.tokens) throw new Error('Connect with Twitch first.');
    if (!forceRefresh && Date.now() < this.tokens.expiresAt - 60000) return this.tokens.access_token;
    this.refreshPromise ??= (async () => {
      const response = await this.form('token', { client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.tokens!.refresh_token });
      const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!response.ok || !body.access_token || !body.refresh_token || !body.expires_in) { this.user = undefined; this.changed(); throw new Error('Twitch refresh failed. Connect again.'); }
      await this.save({ access_token: body.access_token, refresh_token: body.refresh_token, expiresAt: Date.now()+body.expires_in*1000 });
      return body.access_token;
    })();
    try { return await this.refreshPromise; } finally { this.refreshPromise = undefined; }
  }
  async validate() {
    try {
    const token = await this.token();
    let response = await this.http('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(8000) });
    if (response.status === 401) response = await this.http('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${await this.token(true)}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Twitch token invalid. Connect again.');
    const value = await response.json() as { user_id: string; login: string; client_id: string; scopes?: string[] };
    if (value.client_id !== this.clientId || !value.user_id || !value.login) throw new Error('Saved token belongs to another Twitch application. Connect again.');
    const missing = scopes.filter(scope => !value.scopes?.includes(scope));
    if (missing.length) throw new Error(`Twitch permissions missing: ${missing.join(', ')}. Connect again.`);
    this.user = { id: value.user_id, login: value.login, displayName: value.login }; this.changed();
    } catch (error) { this.user = undefined; this.changed(); throw error; }
  }
  async helix(path: string, init: RequestInit = {}): Promise<Response> {
    const call = async (token: string) => this.http(`https://api.twitch.tv/helix/${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) });
    const response = await call(await this.token()); return response.status === 401 ? call(await this.token(true)) : response;
  }
  close() { this.epoch++; if (this.pollTimer) clearTimeout(this.pollTimer); if (this.validationTimer) clearInterval(this.validationTimer); }
}
