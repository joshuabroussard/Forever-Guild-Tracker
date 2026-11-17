import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.js';
import { DiscordOAuth, canManageFromList } from '../src/web/discord-oauth.js';
import { Store } from '../src/store.js';
import { BlizzardPool } from '../src/tracker.js';
import { server as serverSettings, roster, blizzardFetch } from './helpers.js';

const SERVER = '111111111111111111';
const OTHER = '999999999999999999';
let http, base, published = [];
const store = new Store(null);

const discordFetch = async (url, init) => {
  if (url.endsWith('/oauth2/token')) {
    const body = new URLSearchParams(init.body);
    if (body.get('code') !== 'good-code') return { ok: false, status: 400 };
    return { ok: true, json: async () => ({ access_token: 'user-token' }) };
  }
  if (url.endsWith('/users/@me')) return { ok: true, json: async () => ({ id: 'u1', username: 'josh', global_name: 'Josh' }) };
  if (url.endsWith('/users/@me/guilds')) {
    return { ok: true, json: async () => [
      { id: SERVER, name: 'Our Guild', icon: null, owner: false, permissions: '32' },
      { id: OTHER, name: 'Not mine', icon: null, owner: false, permissions: '1024' },
      { id: '333333333333333333', name: 'Needs bot', icon: null, owner: true, permissions: '0' },
    ] };
  }
  throw new Error('unexpected ' + url);
};

const bot = {
  botPermissions: 2251799813766144n,
  botPresent: (id) => id === SERVER || id === OTHER,
  serverName: (id) => (id === SERVER ? 'Our Guild' : 'Not mine'),
  postableChannels: () => [{ id: '222', name: 'guild-progress' }],
  canManage: async (id, userId) => id === SERVER && userId === 'u1',
  publish: async (id) => { published.push(id); return { ok: true }; },
};

before(async () => {
  const env = { sessionSecret: 'x'.repeat(40), publicUrl: 'http://127.0.0.1', refreshMinutes: 15 };
  const oauth = new DiscordOAuth({ clientId: 'app', clientSecret: 'secret', redirectUri: 'https://wow.chille.sh/callback', fetchImpl: discordFetch });
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: blizzardFetch(() => roster({ A: 60, B: 22 })) });
  http = createWebServer({ env, store, bot, pool, oauth, secureCookies: false });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${http.address().port}`;
});
after(() => http.close());

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (path, cookie, form, origin) => fetch(base + path, {
  method: 'POST', redirect: 'manual',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) },
  body: new URLSearchParams(form),
});
const cookiesFrom = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

async function signIn() {
  const login = await get('/login');
  assert.equal(login.status, 303);
  const loc = new URL(login.headers.get('location'));
  assert.equal(loc.origin, 'https://discord.com');
  assert.equal(loc.searchParams.get('scope'), 'identify guilds');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://wow.chille.sh/callback');
  const state = loc.searchParams.get('state');
  const cb = await get(`/callback?code=good-code&state=${state}`, cookiesFrom(login));
  assert.equal(cb.status, 303);
  return cookiesFrom(cb);
}

test('signed-out visitors see the sign-in page and are sent to log in elsewhere', async () => {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Sign in with Discord/);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const settings = await get(`/servers/${SERVER}`);
  assert.equal(settings.status, 303);
  assert.equal(settings.headers.get('location'), '/login');
});

test('callback with a forged state is refused', async () => {
  const login = await get('/login');
  const res = await get('/callback?code=good-code&state=forged', cookiesFrom(login));
  assert.equal(res.status, 400);
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('sid=') && !c.startsWith('sid=;')));
});

test('server list shows only servers you manage, with add-bot links', async () => {
  const sid = await signIn();
  const html = await (await get('/', sid)).text();
  assert.match(html, /Our Guild/);
  assert.match(html, /Needs bot/);
  assert.doesNotMatch(html, /Not mine/);
  assert.match(html, /guild_id=333333333333333333/);
  assert.match(html, /Josh/);
});

test('settings can only be saved with the form token, by someone who can manage the server', async () => {
  const sid = await signIn();
  const page = await (await get(`/servers/${SERVER}`, sid)).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const form = { csrf, guildName: "Ashen Oath's Watch", region: 'us', channelId: '222', timezone: 'America/Chicago', sections: 'leveling', top: '10', maxLevel: '60', showMovers: '3', color: '#ff0000', enabled: 'on', action: 'save' };

  assert.equal((await post(`/servers/${SERVER}`, sid, { ...form, csrf: 'wrong' })).status, 403);
  assert.equal((await post(`/servers/${SERVER}`, sid, form, 'https://evil.example')).status, 403);
  assert.equal((await get(`/servers/${OTHER}`, sid)).status, 403);
  assert.equal((await post(`/servers/${OTHER}`, sid, form)).status, 403);
  assert.equal(store.get(OTHER), null);

  const saved = await post(`/servers/${SERVER}`, sid, form);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get('location'), `/servers/${SERVER}?saved=1`);
  const s = store.get(SERVER);
  assert.equal(s.guildName, "Ashen Oath's Watch");
  assert.equal(s.leveling.top, 10);
  assert.deepEqual(s.sections, ['leveling']);
  assert.equal(s.updatedBy, 'u1');
  assert.deepEqual(published, [SERVER]);
  assert.match(await (await get(`/servers/${SERVER}?saved=1`, sid)).text(), /Saved\. The embed will update/);
});

test('bad input is shown back with errors and not saved', async () => {
  const sid = await signIn();
  const page = await (await get(`/servers/${SERVER}`, sid)).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const before = store.get(SERVER);
  const res = await post(`/servers/${SERVER}`, sid, { csrf, guildName: '<script>x</script>', region: 'us', channelId: 'nope', action: 'save' });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Pick a channel the bot can post in/);
  assert.doesNotMatch(html, /<script>x/);
  assert.deepEqual(store.get(SERVER), before);
});

test('check guild looks it up without saving', async () => {
  const sid = await signIn();
  const page = await (await get(`/servers/${SERVER}`, sid)).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const res = await post(`/servers/${SERVER}`, sid, { csrf, guildName: 'Some Other Guild', region: 'eu', channelId: '222', action: 'check' });
  const html = await res.text();
  assert.match(html, /Found <b>Ashen Oath&#39;s Watch<\/b> with 2 characters/);
  assert.match(html, /value="Some Other Guild"/);
  assert.equal(store.get(SERVER).guildName, "Ashen Oath's Watch");
});

test('sign out ends the session', async () => {
  const sid = await signIn();
  const page = await (await get('/', sid)).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  assert.equal((await post('/logout', sid, { csrf })).status, 303);
  assert.equal((await get(`/servers/${SERVER}`, sid)).headers.get('location'), '/login');
});

test('Discord server list filter allows owners, admins and Manage Server only', () => {
  assert.equal(canManageFromList({ owner: true, permissions: '0' }), true);
  assert.equal(canManageFromList({ permissions: '8' }), true);
  assert.equal(canManageFromList({ permissions: '32' }), true);
  assert.equal(canManageFromList({ permissions: '1024' }), false);
});
