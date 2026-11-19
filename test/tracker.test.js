import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, normalizeServerForm } from '../src/config.js';
import { BlizzardClient, parseRoster } from '../src/blizzard.js';
import { BlizzardPool, refreshServer, checkGuild } from '../src/tracker.js';
import { buildEmbed, embedLength } from '../src/embed.js';
import { updateBaseline } from '../src/state.js';
import { Store } from '../src/store.js';
import { server, roster, blizzardFetch } from './helpers.js';

test('slugify matches the community-observed Forever slug format', () => {
  assert.equal(slugify("Ashen Oath's Watch"), 'ashen-oaths-watch');
  assert.equal(slugify('  Lök  Tar '), 'lok-tar');
});

test('roster request uses the realmless Forever profile namespace', async () => {
  const fetch = blizzardFetch(() => roster({ A: 10 }));
  await new BlizzardClient({ clientId: 'x', clientSecret: 'y', region: 'eu', fetchImpl: fetch }).getRoster('ashen-oaths-watch');
  assert.ok(fetch.calls.includes('https://eu.api.blizzard.com/data/wow/guild/ashen-oaths-watch/roster?namespace=profile-forever-eu&locale=en_US'));
});

test('parseRoster maps class names and adds a surname when present', () => {
  const body = roster({ Thrall: 60 });
  body.members[0].character.surname = 'Stormborn';
  const { members } = parseRoster(body, { 1: 'Warrior' });
  assert.deepEqual(members[0], { id: 1, name: 'Thrall Stormborn', level: 60, classId: 1, className: 'Warrior', rank: 0, profilePath: '/profile/wow/character/thrall-stormborn' });
});

test('embed is a ranked list with class icons and today\'s gains', async () => {
  const levels = { Thrall: 60, Mira: 60, Kol: 53, Sena: 52, Bo: 12, Tiny: 4 };
  let body = roster(levels);
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: blizzardFetch(() => body) });
  const emojis = { 1: '<:wow_warrior:101>' };
  let s = { ...server };
  const first = await refreshServer(pool, s, { refreshMinutes: 15, emojis, now: new Date('2026-11-17T14:00:00Z') });
  s = { ...s, ...first.patch };
  body = roster({ ...levels, Kol: 57 });
  const { embed, error } = await refreshServer(pool, s, { refreshMinutes: 15, emojis, now: new Date('2026-11-17T20:00:00Z') });

  assert.equal(error, null);
  assert.equal(embed.title, "Ashen Oath's Watch · leveling");
  assert.equal(embed.footer, undefined);
  const lines = embed.description.split('\n');
  assert.equal(lines[0], '-# 6 characters · average level 41 · highest 60');
  assert.equal(lines[1], '');
  assert.equal(lines[2], '🩷 `60` **Mira**');
  assert.equal(lines[3], '<:wow_warrior:101> `60` **Thrall**');
  assert.equal(lines[4], '🟢 `57` **Kol** +4');
  assert.equal(lines[7], '⚫ ` 4` **Tiny**');
  assert.doesNotMatch(embed.description, /level 10/);
});

test('characters past the list size are counted, not listed', () => {
  const members = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `C${i}`, level: 30 - i, classId: 8 }));
  const embed = buildEmbed({ members, baseline: null, config: { ...server, leveling: { top: 25 } } });
  assert.match(embed.description, /\n-# and 5 more$/);
  assert.equal(embed.description.split('\n').filter((l) => l.startsWith('🩵')).length, 25);
});

test('only the sections picked on the website are shown', () => {
  const members = [{ id: 1, name: 'A', level: 30, classId: 8 }];
  const embed = buildEmbed({ members, baseline: null, config: { ...server, sections: ['summary'] } });
  assert.equal(embed.description, '-# 1 character · average level 30 · highest 30');
});

test('gains reset at local midnight, not UTC midnight', () => {
  let t = {};
  const m = (level) => [{ id: 1, level }];
  t = updateBaseline(t, m(20), 'America/Chicago', new Date('2026-11-17T23:00:00Z'));
  t = updateBaseline(t, m(22), 'America/Chicago', new Date('2026-11-18T03:00:00Z'));
  assert.equal(t.baseline.levels[1], 20);
  t = updateBaseline(t, m(23), 'America/Chicago', new Date('2026-11-18T07:00:00Z'));
  assert.equal(t.baseline.levels[1], 22);
});

test('a missing guild keeps the last data and says why', async () => {
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: blizzardFetch(() => ({}), 404) });
  const s = { ...server, lastMembers: [{ id: 1, name: 'A', level: 30, className: 'Mage' }] };
  const { embed, patch } = await refreshServer(pool, s, { refreshMinutes: 15 });
  assert.match(embed.footer.text, /not found/);
  assert.match(embed.description, /^-# 1 character/);
  assert.equal(patch.lastMembers, undefined);
  assert.match(patch.lastError, /ashen-oaths-watch/);
});

test('checkGuild reports what it found', async () => {
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: blizzardFetch(() => roster({ A: 1, B: 2 })) });
  assert.deepEqual(await checkGuild(pool, server), { ok: true, slug: 'ashen-oaths-watch', name: "Ashen Oath's Watch", count: 2 });
});

test('a 1,000-member guild stays inside Discord\'s embed limits', () => {
  const members = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Character${i} Longsurname`, level: (i % 60) + 1, classId: 9 }));
  const emojis = { 9: '<:wow_warlock:123456789012345678>' };
  const embed = buildEmbed({ members, baseline: null, emojis, config: { ...server, leveling: { top: 50 } } });
  assert.ok(embed.description.length <= 4096);
  assert.ok(embedLength(embed) <= 6000);
});

test('settings form is validated', () => {
  const bad = normalizeServerForm({ guildName: '', region: 'xx', channelId: '9', timezone: 'Mars/Base', sections: 'nope' }, ['1']);
  assert.equal(bad.errors.length, 5);
  const ok = normalizeServerForm({ guildName: ' Ashen Oath ', region: 'US', channelId: '1', timezone: 'Europe/Berlin', sections: ['leveling', 'summary'], top: '99', enabled: 'on' }, ['1']);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.guildName, 'Ashen Oath');
  assert.equal(ok.value.region, 'us');
  assert.equal(ok.value.leveling.top, 50);
  assert.deepEqual(ok.value.sections, ['summary', 'leveling']);
  assert.equal(ok.value.enabled, true);
});

test('changing the WoW guild clears old tracking; changing channel reposts', () => {
  const store = new Store(null);
  store.saveSettings('1', { ...server }, 'u');
  store.patch('1', { messageId: 'm', lastMembers: [{ id: 1 }], baseline: { date: 'x', levels: {} } });
  store.saveSettings('1', { ...server, timezone: 'Europe/Berlin' }, 'u');
  assert.equal(store.get('1').messageId, 'm');
  assert.ok(store.get('1').lastMembers);
  store.saveSettings('1', { ...server, guildName: 'Other' }, 'u');
  assert.equal(store.get('1').lastMembers, undefined);
  store.saveSettings('1', { ...server, guildName: 'Other', channelId: '333' }, 'u');
  assert.equal(store.get('1').messageId, null);
});

test('levels come from character profiles when the roster lags', async () => {
  const body = roster({ Thrall: 30, Mira: 20, Tiny: 4 });
  body.members[1].character.key = { href: 'https://us.api.blizzard.com/profile/wow/character/mira-dawn?namespace=profile-forever-us' };
  const profiles = { '/profile/wow/character/thrall': { level: 33 }, '/profile/wow/character/mira-dawn': { level: 18 } };
  const fetch = blizzardFetch(
    (url) => profiles[new URL(url).pathname] || body,
    (url) => (url.includes('/profile/wow/character/') && !profiles[new URL(url).pathname] ? 404 : 200),
  );
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: fetch });
  let s = { ...server };
  const first = await refreshServer(pool, s, { refreshMinutes: 15, now: new Date('2026-11-17T14:00:00Z') });
  const byName = Object.fromEntries(first.patch.lastMembers.map((m) => [m.name, m.level]));
  assert.deepEqual(byName, { Thrall: 33, Mira: 20, Tiny: 4 }); // profile ahead, profile behind, no profile
  assert.equal(first.patch.lastMembers.find((m) => m.name === 'Mira').profilePath, '/profile/wow/character/mira-dawn'); // kept for the website
  assert.ok(fetch.calls.some((u) => u.includes('/profile/wow/character/mira-dawn?namespace=profile-forever-us')));

  s = { ...s, ...first.patch };
  profiles['/profile/wow/character/thrall'] = { level: 35 };
  const { embed } = await refreshServer(pool, s, { refreshMinutes: 15, now: new Date('2026-11-17T20:00:00Z') });
  assert.match(embed.description, /`35` \*\*Thrall\*\* \+2/);
});

test('profile lookups run a few at a time and survive API errors', async () => {
  const names = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`C${i}`, 10 + i]));
  let inFlight = 0, peak = 0;
  const client = {
    async getCharacter(path) {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (path.endsWith('c3')) throw new Error('Blizzard API 503');
      return { level: 50 };
    },
  };
  const { members } = parseRoster(roster(names));
  const out = await (await import('../src/tracker.js')).withProfileLevels(client, members);
  assert.ok(peak <= 4);
  assert.equal(out.find((m) => m.name === 'C3').level, 13);
  assert.equal(out.find((m) => m.name === 'C0').level, 50);
});

test('embed title and the and-more line link to the guild page', async () => {
  const body = roster(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`C${i}`, 20 + i])));
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: blizzardFetch(() => body) });
  const s = { ...server, leveling: { maxLevel: 60, top: 5 } };
  const { embed } = await refreshServer(pool, s, { refreshMinutes: 15, publicUrl: 'https://wow.chille.sh' });
  assert.equal(embed.url, 'https://wow.chille.sh/g/us/ashen-oaths-watch');
  assert.match(embed.description, /\n-# \[and 3 more\]\(https:\/\/wow\.chille\.sh\/g\/us\/ashen-oaths-watch\)$/);

  const off = await refreshServer(pool, { ...s, publicPage: false }, { refreshMinutes: 15, publicUrl: 'https://wow.chille.sh' });
  assert.equal(off.embed.url, undefined);
  assert.match(off.embed.description, /\n-# and 3 more$/);
});

test('armory details are parsed and cached', async () => {
  const { Armory, parseCharacter } = await import('../src/armory.js');
  let calls = 0;
  let iconCalls = 0;
  const pool = { for: () => ({ async getItemIconUrl(id) { iconCalls++; return `https://render.worldofwarcraft.com/icons/56/${id}.jpg`; }, async get(path) {
    calls++;
    if (path.endsWith('/statistics')) return { health: 1200, power: 900, power_type: { name: 'Mana' }, strength: { base: 40, effective: 52 }, melee_crit: { value: 5.234 }, dodge: { value: 0 } };
    if (path.endsWith('/equipment')) return { equipped_items: [{ item: { id: 77 }, slot: { name: 'Head', type: 'HEAD' }, name: 'Cap of Tests', quality: { type: 'RARE' }, level: { value: 33 },
      binding: { name: 'Binds when picked up' }, armor: { display: { display_string: '120 Armor' } },
      stats: [{ type: { name: 'Stamina' }, value: 8, display: { display_string: '+8 Stamina', color: { r: 255, g: 255, b: 255, a: 1 } } }],
      spells: [{ description: 'Equip: Improves your chance to hit by 1%.' }] }] };
    if (path.endsWith('/character-media')) return { assets: [{ key: 'inset', value: 'https://render.worldofwarcraft.com/us/x.jpg' }] };
    return { name: 'Thrall', level: 42, race: { name: 'Orc' }, character_class: { name: 'Shaman' }, equipped_item_level: 31 };
  } }) };
  let t = 0;
  const armory = new Armory(pool, { now: () => t });
  const a = await armory.character('us', 'en_US', '/profile/wow/character/thrall');
  assert.equal(a.found, true);
  assert.equal(a.level, 42);
  assert.equal(a.items[0].quality, 'RARE');
  assert.equal(a.items[0].icon, 'https://render.worldofwarcraft.com/icons/56/77.jpg');
  assert.equal(a.items[0].armor, '120 Armor');
  assert.equal(a.items[0].stats[0].color, 'rgb(255,255,255)');
  assert.deepEqual(a.items[0].spells, ['Equip: Improves your chance to hit by 1%.']);
  assert.deepEqual(a.stats.map((g) => g.title), ['General', 'Attributes', 'Melee']);
  assert.deepEqual(a.stats[0].rows, [['Health', '1,200'], ['Mana', '900']]);
  assert.deepEqual(a.stats[2].rows, [['Crit chance', '5.23%']]);
  assert.equal(a.image, 'https://render.worldofwarcraft.com/us/x.jpg');
  await armory.character('us', 'en_US', '/profile/wow/character/thrall');
  assert.equal(calls, 4);
  t = 11 * 60_000;
  await armory.character('us', 'en_US', '/profile/wow/character/thrall');
  assert.equal(calls, 8);
  assert.equal(iconCalls, 1); // icons are kept for a day
  assert.equal(parseCharacter({}, null, { assets: [{ key: 'inset', value: 'https://evil.example/x.jpg' }] }).image, null);
});

const dungeonBody = (list) => ({
  expansions: [{ expansion: { name: 'Classic' }, instances: list.map(([id, name, status, kills]) => ({
    instance: { id, name },
    modes: [{ difficulty: { type: 'NORMAL' }, status: { type: status }, progress: {
      completed_count: kills.filter((k) => k > 0).length, total_count: kills.length,
      encounters: kills.map((k, i) => ({ encounter: { id: i }, completed_count: k })),
    } }],
  })) }],
});

// Forever's real answer: boss kills under Dungeons & Raids.
const bossKills = (kills) => ({ categories: [
  { name: 'Character', statistics: [{ name: 'Times camped', quantity: 18 }] },
  { name: 'Dungeons & Raids', statistics: [{ name: 'Total 5-player dungeons entered', quantity: 20 }], sub_categories: [
    { name: 'Boss Kills', statistics: kills.map(([name, quantity]) => ({ name, quantity })) },
  ] },
  { name: 'Deaths', sub_categories: [{ name: 'Dungeons and Raids', statistics: [{ name: 'Total deaths in 5-player dungeons', quantity: 7 }] }] },
] });

test('dungeon clears are read from boss kill statistics', async () => {
  const { parseDungeons } = await import('../src/dungeons.js');
  assert.deepEqual(parseDungeons(bossKills([
    ['Edwin VanCleef Kills (Deadmines)', 1],
    ['Shade of the Archmage Kills (City of Dalaran)', 2],
    ['Lyn the Ignored Kills (City of Dalaran)', 1],
    ['Bazzalan kills (Ragefire Chasm)', 3],
    ['Mutanus the Devourer kills (Wailing Caverns)', 0],
  ])), {
    deadmines: { name: 'Deadmines', status: 'done', clears: 1 },
    'city of dalaran': { name: 'City of Dalaran', status: 'done', clears: 2 },
    'ragefire chasm': { name: 'Ragefire Chasm', status: 'done', clears: 3 },
  });
  assert.deepEqual(parseDungeons(bossKills([])), {});
});

test('dungeon progress is parsed into cleared and partway', async () => {
  const { parseDungeons } = await import('../src/dungeons.js');
  const d = parseDungeons(dungeonBody([[1, 'The Deadmines', 'COMPLETE', [3, 2, 2]], [2, 'Wailing Caverns', 'IN_PROGRESS', [1, 0, 0]]]));
  assert.deepEqual(d, { 1: { name: 'The Deadmines', status: 'done', clears: 2 }, 2: { name: 'Wailing Caverns', status: 'partial', clears: 0 } });
  assert.deepEqual(parseDungeons({}), {});
});

test('dungeon board lists who still needs a first clear, skipping characters too low', async () => {
  const { dungeonBoard } = await import('../src/dungeons.js');
  const members = [
    { id: 1, name: 'Thrall', level: 30, classId: 7 },
    { id: 2, name: 'Mira', level: 20, classId: 5 },
    { id: 3, name: 'Bo', level: 15, classId: 1 },
    { id: 4, name: 'Tiny', level: 4, classId: 1 },
  ];
  const board = dungeonBoard(members, {
    1: { 10: { name: 'The Deadmines', status: 'done', clears: 1 }, 11: { name: 'Shadowfang Keep', status: 'partial', clears: 0 } },
    2: {},
    3: { 10: { name: 'The Deadmines', status: 'partial', clears: 0 } },
  });
  const dm = board.find((d) => d.name === 'The Deadmines');
  assert.equal(dm.minLevel, 17);
  assert.deepEqual(dm.done.map((m) => m.name), ['Thrall']);
  assert.deepEqual(dm.needs.map((m) => m.name), ['Mira']); // Bo is 15, below 17; Tiny has no data
  assert.deepEqual(dm.partial.map((m) => m.name), []);
  const sfk = board.find((d) => d.name === 'Shadowfang Keep');
  assert.deepEqual(sfk.partial.map((m) => m.name), ['Thrall']);
  assert.deepEqual(sfk.needs.map((m) => m.name), []); // Mira is 20, below 22
  assert.deepEqual(board.map((d) => d.name), ['The Deadmines', 'Shadowfang Keep']);
});

test('dungeons are read about once an hour, only for level 10+', async () => {
  let dungeonCalls = 0;
  const body = roster({ Thrall: 30, Tiny: 4 });
  const fetch = blizzardFetch((url) => {
    if (url.includes('/achievements/statistics')) { dungeonCalls++; return bossKills([['Edwin VanCleef Kills (Deadmines)', 1]]); }
    if (url.includes('/profile/wow/character/thrall')) return { level: 30 };
    if (url.includes('/profile/wow/character/')) return {};
    return body;
  });
  const pool = new BlizzardPool({ clientId: 'x', clientSecret: 'y', fetchImpl: fetch });
  let s = { ...server };
  const t0 = new Date('2026-11-19T06:00:00Z');
  s = { ...s, ...(await refreshServer(pool, s, { refreshMinutes: 15, now: t0, dungeonLog: () => {} })).patch };
  assert.deepEqual(s.dungeonStatus, { 1: 'ok' });
  assert.equal(dungeonCalls, 1); // Tiny is under 10, so only Thrall
  assert.equal(s.dungeons[1].deadmines.status, 'done');
  s = { ...s, ...(await refreshServer(pool, s, { refreshMinutes: 15, now: new Date(t0.getTime() + 15 * 60_000) })).patch };
  assert.equal(dungeonCalls, 1);
  s = { ...s, ...(await refreshServer(pool, s, { refreshMinutes: 15, now: new Date(t0.getTime() + 61 * 60_000) })).patch };
  assert.equal(dungeonCalls, 2);
});

test('dungeon reader also takes flatter shapes and says when it can\'t read one', async () => {
  const { parseDungeons, fetchDungeons } = await import('../src/dungeons.js');
  const flat = { dungeons: [
    { dungeon: { id: 5, name: 'Ragefire Chasm' }, encounters: [{ completed_count: 2 }, { completed_count: 1 }] },
    { dungeon: { id: 6, name: 'Wailing Caverns' }, encounters: [{ completed_count: 1 }, { completed_count: 0 }] },
  ] };
  assert.deepEqual(parseDungeons(flat), {
    5: { name: 'Ragefire Chasm', status: 'done', clears: 1 },
    6: { name: 'Wailing Caverns', status: 'partial', clears: 0 },
  });
  const logs = [];
  const client = { getDungeons: async (p) => (p.endsWith('a') ? { something: [{ odd: 1 }] } : Promise.reject(Object.assign(new Error('nf'), { status: 404 }))) };
  const { status } = await fetchDungeons(client, [
    { id: 1, name: 'A', level: 30, profilePath: '/x/a' },
    { id: 2, name: 'B', level: 30, profilePath: '/x/b' },
  ], {}, { log: (l) => logs.push(l) });
  assert.deepEqual(status, { 1: 'empty', 2: 'notfound' });
  assert.match(logs.join('\n'), /couldn't read the answer for A; it starts \{"something"/);
  assert.match(logs.join('\n'), /checked 2 characters: 1 empty, 1 notfound/);
});
