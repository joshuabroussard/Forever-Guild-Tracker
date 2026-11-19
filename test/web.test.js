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
  const form = { csrf, guildName: "Ashen Oath's Watch", region: 'us', channelId: '222', timezone: 'America/Chicago', sections: 'leveling', top: '10', color: '#ff0000', enabled: 'on', action: 'save' };

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

test('guild and character pages are public, ranked, and escaped', async () => {
  store.patch(SERVER, {
    publicPage: true,
    wowGuildDisplayName: 'Ashen <b>Oath</b>',
    lastRefreshAt: '2026-11-18T20:00:00Z',
    baseline: { date: '2026-11-18', levels: { 1: 55, 2: 22, 3: 22 } },
    lastMembers: [
      { id: 1, name: 'Thrall Stormborn', level: 60, classId: 7, className: 'Shaman', profilePath: '/profile/wow/character/thrall-stormborn' },
      { id: 2, name: 'Mira', level: 22, classId: 5, className: 'Priest' },
      { id: 3, name: 'Bo', level: 22, classId: 1, className: 'Warrior' },
    ],
    dungeons: {
      1: { 10: { name: 'The Deadmines', status: 'done', clears: 3 } },
      2: { 10: { name: 'The Deadmines', status: 'partial', clears: 0 } },
      3: {},
    },
    dungeonsAt: '2026-11-18T20:00:00Z',
  });
  const res = await get('/g/us/ashen-oaths-watch');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /render\.worldofwarcraft\.com/);
  const html = await res.text();
  assert.match(html, /Ashen &lt;b&gt;Oath&lt;\/b&gt;/);
  assert.match(html, /3 members · avg 35/);
  assert.match(html, /👑 <a href="\/g\/us\/ashen-oaths-watch\/thrall-stormborn"[^>]*>Thrall Stormborn<\/a> <span class="gain">\+5<\/span>/);
  assert.match(html, /<td class="n">2<\/td>.*Bo.*<td class="n">2<\/td>.*Mira/s); // tied levels share a place
  const needs = html.slice(html.indexOf('Needs a first clear'));
  assert.match(needs, /<b>The Deadmines<\/b><span class="lv">17\+<\/span><span class="ct"><b>1<\/b>\/3<\/span>/);
  assert.match(needs, />Bo<\/a><a class="part" title="Partway"[^>]*>Mira<\/a>/);

  const char = await get('/g/us/ashen-oaths-watch/thrall-stormborn');
  assert.equal(char.status, 200);
  const ch = await char.text();
  assert.match(ch, /<b>#1<\/b> in guild/);
  assert.match(ch, /<b>\+5<\/b> today/);
  assert.match(ch, /Cleared<\/h2><div class="chips"><span class="chip">The Deadmines <span class="muted">×3/);
  assert.match(await (await get('/g/us/ashen-oaths-watch/bo')).text(), /Needs<\/h2><div class="chips"><span class="chip">The Deadmines/);

  const font = await get('/fonts/inter.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'font/woff2');

  const raw = await get('/g/us/ashen-oaths-watch/thrall-stormborn/raw');
  assert.equal(raw.status, 200);
  assert.match(raw.headers.get('content-type'), /application\/json/);
  const rawBody = await raw.json();
  assert.ok('dungeons' in rawBody && 'achievements' in rawBody && 'statistics' in rawBody);
  assert.equal((await get('/g/us/ashen-oaths-watch/thrall-stormborn/other')).status, 404);

  assert.equal((await get('/g/us/ashen-oaths-watch/nobody')).status, 404);
  assert.equal((await get('/g/us/some-other-guild')).status, 404);
  assert.equal((await get('/g/us/%E0%A4%A')).status, 404);
  store.patch(SERVER, { publicPage: false });
  assert.equal((await get('/g/us/ashen-oaths-watch')).status, 404);
  store.patch(SERVER, { publicPage: true });
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

test('character page lays gear out like the armory, with tooltips', async () => {
  const { characterPage } = await import('../src/web/guild-pages.js');
  const { parseItem } = await import('../src/armory.js');
  const server = { ...serverSettings, wowGuildDisplayName: 'the girls' };
  const member = { id: 1, name: 'Ivy', level: 36, classId: 11 };
  const items = [
    parseItem({ item: { id: 1 }, slot: { type: 'HEAD', name: 'Head' }, name: "Defender's Leather Hood", quality: { type: 'RARE' }, level: { value: 25 },
      binding: { name: 'Binds when equipped' }, inventory_type: { name: 'Head' }, item_subclass: { name: 'Leather' },
      armor: { display: { display_string: '98 Armor' } }, stats: [{ type: { name: 'Agility' }, value: 6, display: { display_string: '+6 Agility' } }],
      spells: [{ description: 'Equip: <script>alert(1)</script>' }] }),
    parseItem({ item: { id: 2 }, slot: { type: 'MAIN_HAND', name: 'Main Hand' }, name: 'Ceremonial Mallet', quality: { type: 'RARE' }, level: { value: 42 },
      weapon: { damage: { display_string: '60 - 91 Damage' }, attack_speed: { display_string: 'Speed 3.50' }, dps: { display_string: '(21.6 damage per second)' } } }),
  ];
  items[0].icon = 'https://render.worldofwarcraft.com/icons/56/inv_helmet.jpg';
  const html = characterPage({ server, member, ranked: [{ ...member, place: 1, gained: 0 }], armory: { found: true, level: 36, race: 'Night Elf', className: 'Druid', items, stats: [], render: 'https://render.worldofwarcraft.com/forever-us/x-main-raw.png' } });
  assert.match(html, />36 Night Elf Druid</);
  assert.match(html, /class="slot qRARE" tabindex="0"[^>]*><span class="ic" style="background-image:url\('https:\/\/render\.worldofwarcraft\.com\/icons\/56\/inv_helmet\.jpg'\)"/);
  assert.match(html, /<div class="tip" role="tooltip"><div class="t">Defender&#39;s Leather Hood<\/div><div class="y">Item Level 25<\/div><div>Binds when equipped<\/div>/);
  assert.match(html, /60 - 91 Damage<\/span><span>Speed 3\.50/);
  assert.match(html, /class="slot empty"><span class="ic"><\/span><span class="nm"><span>Neck/);
  assert.match(html, /x-main-raw\.png/);
  assert.doesNotMatch(html, /<script>alert/);
});
